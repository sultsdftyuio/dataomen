// lib/seo/file-analysis-1.tsx
import React from 'react';
import { FileSpreadsheet, FileJson, TableProperties, Database, Terminal, ShieldAlert } from 'lucide-react';

/**
 * SEOPageData Interface - Data Transformation Blueprint
 * Upgraded to integrate High-Converting elements (Interactive Demos, 
 * Audience Personas, CTA Hierarchies) while maintaining the aggressive 
 * "Pain Elimination" and "Tool Replacement" SEO strategies.
 */
export type SEOPageData = {
  type: 'guide';
  title: string;
  description: string;
  metaKeywords: string[];
  seoIntents: string[]; 
  h1: string; 
  subtitle: string;
  icon: React.ReactElement;
  replaces: string[]; 
  
  // NEW: Interactive Demo Payload
  demoPipeline?: {
    userPrompt: string;
    aiInsight: string;
    generatedSql: string;
    chartMetric: string;
  };

  // NEW: Audience Segmentation
  targetPersonas?: {
    role: string;
    iconType: 'exec' | 'ops' | 'data';
    description: string;
    capabilities: string[];
  }[];

  // NEW: CTA Hierarchy
  ctaHierarchy?: {
    primary: { text: string; href: string };
    secondary: { text: string; href: string };
  };

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
    subtitle: 'Stop fighting spreadsheet limits. Drop your multi-million row CSVs into Arcli. Our engine infers the structure and builds interactive charts in milliseconds—without moving your data to the cloud.',
    icon: <FileSpreadsheet className="w-12 h-12 text-amber-500 mb-6" />,
    replaces: [
      'Excel freezing on large datasets',
      'Manual CSV merging and VLOOKUPs',
      'Python scripts for one-off data cleaning',
      'Expensive cloud data warehouses for simple questions'
    ],

    // Powered Interactive Demo
    demoPipeline: {
      userPrompt: "Group this 5GB sales export by region and show me the top 3 product categories.",
      aiInsight: "Processed 14.2M rows locally in 1.4 seconds. The NA region drives 60% of volume, heavily led by 'Enterprise Software' subscriptions.",
      generatedSql: "SELECT region, category, SUM(revenue) as total_rev FROM read_csv_auto('sales_5gb.csv') GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 3;",
      chartMetric: "14.2M Rows Parsed"
    },

    // Powered Audience Segmentation
    targetPersonas: [
      {
        role: 'For Data Analysts',
        iconType: 'data',
        description: 'Bypass Excel\'s 1M row limit and analyze massive data dumps instantly without writing custom Python cleaning scripts.',
        capabilities: ['WASM In-Browser Compute', 'Automated Type Inference']
      },
      {
        role: 'For Operations',
        iconType: 'ops',
        description: 'Merge massive vendor inventory CSVs with your internal data effortlessly via conversational AI.',
        capabilities: ['Conversational Joins', 'Cross-File Reconciliation']
      },
      {
        role: 'For Security & IT',
        iconType: 'exec',
        description: 'Analyze sensitive log files strictly in-browser without ever uploading PII to third-party clouds.',
        capabilities: ['Zero-Upload Architecture', 'Ephemeral Processing']
      }
    ],

    // Strong CTA Hierarchy
    ctaHierarchy: {
      primary: { text: 'Analyze CSV Free', href: '/register' },
      secondary: { text: 'Watch Local Performance Demo', href: '#interactive-demo' }
    },

    coreDifferentiator: {
      title: 'Nothing Leaves Your Machine',
      points: [
        'Zero cloud uploads required',
        'Powered by in-browser WebAssembly (DuckDB-WASM)',
        'Zero data leakage risk for sensitive records'
      ]
    },
    businessValueMetrics: [
      { label: 'Processing Limit', value: '10M+ Rows', description: 'Analyze datasets that would instantly crash standard desktop software.' },
      { label: 'Time to Insight', value: 'Seconds', description: 'Stop wasting hours filtering, copying, and pasting between CSV files.' },
      { label: 'Data Privacy', value: 'Absolute', description: 'Files are processed directly in your web browser\'s memory.' }
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
        executiveExplanation: 'Instead of clicking through complex menus, simply type what you want to see. The AI selects the right visualization and renders it instantly.'
      }
    ],
    trustAndSecurity: [
      {
        principle: 'Local-First Execution',
        howWeDeliver: 'When you drop a file into Arcli, it stays on your computer. We use an advanced browser-based engine to crunch the numbers locally.'
      },
      {
        principle: 'Ephemeral Memory State',
        howWeDeliver: 'Once you close your browser tab, your uploaded files vanish. We maintain a strict zero-retention policy for local file uploads.'
      },
      {
        principle: 'Schema-Only AI Inference',
        howWeDeliver: 'To translate your English question into a chart, we only send the column names (e.g., "Revenue", "Date") to our AI securely.'
      }
    ],
    painElimination: {
      headline: 'What This Replaces: The CSV Nightmare',
      before: [
        'Opening a 2-million row export freezes your computer and completely crashes your spreadsheet application.',
        'Merging two different reports requires writing brittle VLOOKUPs that break if a single column is moved.'
      ],
      after: [
        'You drop multi-gigabyte files into the browser and start analyzing them in 3 seconds flat.',
        'You merge datasets effortlessly by asking plain-English questions, completely eliminating manual formula errors.'
      ]
    },
    stepByStepGuide: [
      { step: 1, title: 'Upload Your CSV', detail: 'Drag and drop your massive file directly into the browser window.' },
      { step: 2, title: 'Ask Your Question', detail: 'Type what you want to see in plain English, like "Group revenue by region."' },
      { step: 3, title: 'Refine Results', detail: 'Chat with the AI to filter outliers or change the chart type instantly.' },
      { step: 4, title: 'Export Insights', detail: 'Download the cleaned, summarized subset of your data to share.' }
    ],
    commonMistakes: [
      'Trying to open a 500MB+ CSV in Excel and waiting 20 minutes for it to crash.',
      'Writing a custom Python script just to filter out blank rows.',
      'Uploading highly confidential lists to random cloud formatting tools.'
    ],
    onboardingExperience: {
      phase: '1. Ingest',
      userAction: 'Drag and drop your massive CSV file directly into the browser window.',
      outcome: 'The system reads the headers, understands the context, and is ready for questions in under 3 seconds.'
    },
    analyticalScenarios: [
      {
        title: 'Cross-System Reconciliation',
        complexity: 'Advanced',
        businessQuestion: 'Compare our "Warehouse.csv" with our "Shopify.csv". Show me items Shopify says were sold, but are still sitting in the warehouse.',
        businessOutcome: 'Catch inventory mistakes before they cost you money. Protects the bottom line and prevents severe customer satisfaction issues.',
        sqlSnippet: `SELECT s.item_sku, s.order_date FROM read_csv_auto('shopify.csv') s LEFT JOIN read_csv_auto('warehouse.csv') w ON s.item_sku = w.sku WHERE w.status = 'In Stock' AND s.status = 'Fulfilled';`
      }
    ],
    faqs: [
      { q: 'Is my highly confidential CSV uploaded to your servers?', a: 'No. File processing happens purely on your local machine using a secure browser sandbox. The only data that hits our AI router is the prompt you type and the column headers—never the raw rows.' },
      { q: 'What happens if my CSV file is larger than 1GB?', a: 'Because the platform runs a specialized columnar engine locally inside your browser, it can seamlessly process multi-gigabyte files that would instantly crash traditional desktop software.' },
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

    // Powered Interactive Demo
    demoPipeline: {
      userPrompt: "Reconcile the 'Q3_Forecast' tab with the 'Actuals' tab. Where are we underperforming?",
      aiInsight: "Overall marketing spend is 15% under budget, but Enterprise Sales missed the Q3 forecast by $2.4M due to delayed deal closures in the EMEA region.",
      generatedSql: "SELECT f.department, f.budget, a.actual, (a.actual - f.budget) as variance FROM read_excel('financials.xlsx', sheet='Forecast') f JOIN read_excel('financials.xlsx', sheet='Actuals') a ON f.department = a.department ORDER BY variance ASC;",
      chartMetric: "-$2.4M Variance"
    },

    // Powered Audience Segmentation
    targetPersonas: [
      {
        role: 'For Finance Teams',
        iconType: 'exec',
        description: 'Consolidate regional Excel reports instantly and eliminate the "hidden cell error" that plagues manual spreadsheet modeling.',
        capabilities: ['Multi-Tab Reconciliation', 'Mathematical Transparency']
      },
      {
        role: 'For RevOps',
        iconType: 'ops',
        description: 'Calculate pipeline velocity and quota attainment across multiple messy spreadsheets via plain English.',
        capabilities: ['Automated Data Merging', 'Dynamic Charting']
      },
      {
        role: 'For HR Leaders',
        iconType: 'data',
        description: 'Analyze sensitive headcount and compensation files with 100% local, offline processing.',
        capabilities: ['Local-First Execution', 'Absolute Privacy']
      }
    ],

    // Strong CTA Hierarchy
    ctaHierarchy: {
      primary: { text: 'Analyze Excel Free', href: '/register' },
      secondary: { text: 'See VLOOKUP Alternative', href: '#interactive-demo' }
    },

    coreDifferentiator: {
      title: 'Zero Uploads, 100% Secure',
      points: [
        'Unpacks .xlsx files directly in-browser',
        'No risk of leaking proprietary financial models',
        'Original source files remain completely untouched'
      ]
    },
    businessValueMetrics: [
      { label: 'Accuracy Guarantee', value: 'High', description: 'Eliminates the "hidden cell error" that plagues manual spreadsheets.' },
      { label: 'Skill Barrier', value: 'Removed', description: 'Empowers junior staff to perform senior-level analysis without learning VBA.' },
      { label: 'Report Generation', value: '10x Faster', description: 'Converts a multi-hour weekly consolidation task into a 5-second request.' }
    ],
    capabilities: [
      {
        name: 'Resilient Logic Generation',
        benefit: 'Reports that never break.',
        executiveExplanation: 'Traditional spreadsheets break if someone deletes a column. Our AI references explicit column names, meaning reports work even if the file format shifts.'
      },
      {
        name: 'Automated Financial Modeling',
        benefit: 'Complex math, simplified.',
        executiveExplanation: 'Ask the AI to calculate year-over-year growth or cohort retention. It natively authors the complex math required, replacing fragile Excel tabs.'
      },
      {
        name: 'Visual Presentation Ready',
        benefit: 'Boardroom quality instantly.',
        executiveExplanation: 'Skip the clunky Excel charting menus. The platform automatically selects the most effective visual representation for your data.'
      }
    ],
    trustAndSecurity: [
      {
        principle: 'Private Browser Processing',
        howWeDeliver: 'Your sensitive financial models and employee rosters never leave your machine. Excel files are unpacked locally inside your browser.'
      },
      {
        principle: 'Format Preservation',
        howWeDeliver: 'We never alter your original file. The system reads the data, performs the analysis, and outputs the results independently.'
      }
    ],
    painElimination: {
      headline: 'What This Replaces: Spreadsheet Chaos',
      before: [
        'Finance teams spend days manually consolidating weekly expense reports from 15 different Excel files.',
        'A single mistyped formula in a hidden cell cascades through the entire workbook, corrupting executive reports.'
      ],
      after: [
        'You drop all 15 files in and ask "Summarize expenses by region" to consolidate the data instantly.',
        'Logic is governed by transparent, verifiable code rather than fragile, hidden cell references.'
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
        businessQuestion: 'Group our active sales pipeline by representative, and calculate the average probability of closing.',
        businessOutcome: 'Replaces a manual, weekly pivot-table exercise. Keeps the team aligned on realistic revenue projections.',
        sqlSnippet: `SELECT rep_name, SUM(deal_value) as total_pipeline, AVG(probability_percent) as avg_likelihood FROM read_excel('pipeline.xlsx') WHERE status = 'Open' GROUP BY 1 ORDER BY 2 DESC;`
      }
    ],
    faqs: [
      { q: 'Does this replace Microsoft Excel?', a: 'No. Excel remains the gold standard for manual data entry. Arcli is built to take over when you need to rapidly discover insights, merge files, or build visual dashboards from your Excel data.' },
      { q: 'Can it handle files with multiple tabs (sheets)?', a: 'Yes. When you upload an `.xlsx` file, the platform automatically detects the individual sheets and treats them as related data tables, allowing you to seamlessly query across tabs.' },
      { q: 'What happens if my columns move around next month?', a: 'Your analysis will still work. Because our system relies on semantic column names rather than rigid cell locations (like A1:B10), you can upload a newly formatted file and the AI will adapt instantly.' }
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

    // Powered Interactive Demo
    demoPipeline: {
      userPrompt: "Extract the 'device_os' from this nested Stripe webhook log and show me the failure rate.",
      aiInsight: "iOS devices are currently experiencing a 12% payment failure rate, which is 3x higher than Android users this week.",
      generatedSql: "SELECT json_extract_string(payload, '$.device_os') as os, COUNT(*) filter (where status = 'failed') / COUNT(*) * 100 as failure_rate FROM read_json_auto('stripe_webhooks.json') GROUP BY 1;",
      chartMetric: "12% Failure Rate"
    },

    // Powered Audience Segmentation
    targetPersonas: [
      {
        role: 'For Product Managers',
        iconType: 'exec',
        description: 'Self-serve feature usage metrics from raw JSON API dumps without waiting for DevOps to build a dashboard.',
        capabilities: ['Instant Key Extraction', 'Usage Telemetry']
      },
      {
        role: 'For Support Leads',
        iconType: 'ops',
        description: 'Drop in a user\'s JSON error log and instantly extract the exact failure reason in plain English.',
        capabilities: ['Log Triaging', 'Error Isolation']
      },
      {
        role: 'For Data Engineering',
        iconType: 'data',
        description: 'Automatically unnest complex arrays and JSON STRUCTs into clean tabular formats instantly.',
        capabilities: ['Automated Unnesting', 'Zero-Fee Ingestion']
      }
    ],

    // Strong CTA Hierarchy
    ctaHierarchy: {
      primary: { text: 'Parse JSON Free', href: '/register' },
      secondary: { text: 'Try Live Parser', href: '#interactive-demo' }
    },

    coreDifferentiator: {
      title: 'WASM-Powered Local Parsing',
      points: [
        'Instant JSON flattening done locally in-browser',
        'Zero cloud log ingestion fees',
        'PII embedded in logs stays entirely on your machine'
      ]
    },
    businessValueMetrics: [
      { label: 'Engineering Time', value: 'Saved', description: 'Eliminates the need to write and maintain custom Python scripts.' },
      { label: 'Data Readiness', value: 'Instant', description: 'Transforms unstructured payloads into clean, tabular reports in milliseconds.' },
      { label: 'Cross-Functional Speed', value: 'Maximized', description: 'Support teams can self-serve log investigations without waiting for DevOps.' }
    ],
    capabilities: [
      {
        name: 'Automated JSON Unnesting',
        benefit: 'Makes complex data readable.',
        executiveExplanation: 'Developer files often contain "data within data." Our engine automatically detects nested layers and flattens them into clear columns.'
      },
      {
        name: 'Conversational Key Extraction',
        benefit: 'Find exactly what you need.',
        executiveExplanation: 'Simply ask the AI to "Find users with the feature flag turned on." It dynamically searches through the JSON to extract that specific point.'
      },
      {
        name: 'Seamless Blending',
        benefit: 'Connect the dots.',
        executiveExplanation: 'Upload an unstructured JSON file and drop in a standard CSV. The platform can seamlessly join the unstructured data with your clean tables.'
      }
    ],
    trustAndSecurity: [
      {
        principle: 'No Third-Party Log Ingestion',
        howWeDeliver: 'Unlike cloud tools that charge to ingest your data, Arcli processes JSON files locally and ephemerally, completely free of ingestion fees.'
      },
      {
        principle: 'Deterministic Parsing',
        howWeDeliver: 'We do not use LLMs to "guess" JSON contents. We use a deterministic, optimized local database engine to parse the file, ensuring 100% data fidelity.'
      }
    ],
    painElimination: {
      headline: 'What This Replaces: The Engineering Bottleneck',
      before: [
        'Customer Support receives an error log from a user, but it’s in JSON format and completely unreadable to them.',
        'Product managers must wait for a developer to write a script to extract feature usage statistics from a raw API dump.'
      ],
      after: [
        'Support drops the JSON file in and asks "What error code did this user hit?", getting an answer instantly.',
        'Product managers self-serve their own usage metrics, accelerating feature iteration and roadmap planning.'
      ]
    },
    stepByStepGuide: [
      { step: 1, title: 'Upload Payload', detail: 'Drop your .json or .ndjson export into the interface.' },
      { step: 2, title: 'Extract Keys', detail: 'Ask the AI to extract specific nested data points (e.g., "Pull out the billing address").' },
      { step: 3, title: 'Flatten Structure', detail: 'The engine automatically unwraps nested arrays into a clean table.' },
      { step: 4, title: 'Export as CSV', detail: 'Download the now-readable dataset for further analysis.' }
    ],
    commonMistakes: [
      'Writing a one-off Python script just to pull a single metric out of a log file.',
      'Paying massive cloud ingestion fees to third-party tools just to read an API dump.',
      'Manually trying to unnest complex JSON data inside Notepad++.'
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
        businessQuestion: 'Extract the "amount" from this Stripe JSON export, and show me the total revenue grouped by "customer_email".',
        businessOutcome: 'Allows finance teams to audit raw payment gateway exports without needing a developer to build an integration.',
        sqlSnippet: `SELECT json_extract_string(payload, '$.data.object.customer_email') as email, SUM(CAST(json_extract_string(payload, '$.data.object.amount') AS INTEGER))/100 as total_revenue FROM read_json_auto('stripe_events.json') GROUP BY 1 ORDER BY 2 DESC;`
      }
    ],
    faqs: [
      { q: 'What kind of JSON files can I upload?', a: 'You can upload NDJSON (Newline Delimited JSON), standard JSON arrays, or deeply nested JSON objects. The engine will automatically detect the structure and unpack it.' },
      { q: 'Do I need to know how to write JSON paths?', a: 'No. You simply ask for the data in plain English (e.g., "Extract the user\'s location"). The AI translates your request into the exact JSON-path syntax required to pull the data.' },
      { q: 'Is it safe to upload logs containing customer data?', a: 'Yes. Because the file is processed locally within your web browser using WebAssembly, the raw logs are never uploaded to our servers or exposed to the internet.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'excel-ai-analyzer']
  }
};