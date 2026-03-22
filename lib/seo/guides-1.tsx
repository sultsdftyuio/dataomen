// lib/seo/guides-1.tsx
import React from 'react';
import { TrendingUp, FileText } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Tactical Execution Blueprint" schema. 
 * Designed for high-intent users looking for concrete, step-by-step 
 * methodological solutions to specific analytical hurdles. Focuses on 
 * technical execution, strategy, and measurable business impact.
 */
export type SEOPageData = {
  type: 'feature' | 'integration' | 'comparison' | 'guide' | 'template';
  title: string;
  description: string;
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  features: string[];
  challengeContext: {
    traditionalMethod: string;
    bottlenecks: string[];
  };
  executionStrategy: {
    approach: string;
    technicalEnablers: string[];
  };
  businessImpact: {
    metricImprovements: string[];
    workflowOptimization: string;
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

export const howToGuidesPart1: Record<string, SEOPageData> = {
  'how-to-analyze-sales-data': {
    type: 'guide',
    title: 'How to Analyze Sales Data with AI | Arcli Analytics',
    description: 'A tactical guide to analyzing sales data, pipeline velocity, and rep performance using high-performance AI and natural language generation.',
    h1: 'Executing Advanced Sales Analytics via AI',
    subtitle: 'Extract win rates, pipeline velocity, and forecasting metrics using vectorized AI operations, bypassing the limitations of static spreadsheet models.',
    icon: <TrendingUp className="w-12 h-12 text-green-500 mb-6" />,
    features: [
      'Vectorized Pipeline Velocity Formulas', 
      'Automated Win/Loss Cohort Tracking', 
      'Linear Algebra Forecasting Models',
      'Instant CRM Database Integration'
    ],
    challengeContext: {
      traditionalMethod: 'Heavy reliance on static CSV exports from CRMs (Salesforce/HubSpot) loaded into local spreadsheet applications for macro-based analysis.',
      bottlenecks: [
        'Exporting live CRM data instantly creates disconnected, stale snapshots.',
        'Calculating true pipeline velocity requires complex historical snapshotting that standard grid software struggles to process.',
        'Sales operations teams dedicate excessive weekly cycles to maintaining reporting infrastructure rather than driving strategy.'
      ]
    },
    executionStrategy: {
      approach: 'Direct integration with your CRM read-replica or data warehouse, utilizing semantic AI to translate natural language into dynamic, mathematically precise SQL forecasting models.',
      technicalEnablers: [
        'Direct API/Warehouse synchronization',
        'Vectorized Exponential Moving Average (EMA) forecasting',
        'Context-Aware NLP schema mapping'
      ]
    },
    businessImpact: {
      metricImprovements: [
        'Real-time pipeline velocity and stage-conversion tracking.',
        'Instantaneous cohort win-rate visibility by lead source.'
      ],
      workflowOptimization: 'Shifts RevOps and Sales Operations teams from manual report builders to strategic revenue analysts, automating the extraction of board-level metrics.'
    },
    steps: [
      { name: '1. Establish Connection', text: 'Securely connect your CRM warehouse (e.g., Snowflake, Postgres). Arcli indexes the raw opportunity data into its high-speed semantic engine.' },
      { name: '2. Conversational Extraction', text: 'Request complex metrics naturally (e.g., "Calculate pipeline velocity by sales rep for Q3"). The router maps your schema to the correct formula.' },
      { name: '3. Generate Forecasts', text: 'Command the AI to project Q4 revenue based on historical win rates and open pipeline utilizing precision calculations.' }
    ],
    realExample: {
      query: "Calculate our Win Rate and Average Deal Size for the last 4 quarters, grouped by Lead Source.",
      sql: `SELECT 
  DATE_TRUNC('quarter', close_date) AS quarter,
  lead_source,
  COUNT(id) FILTER (WHERE is_won = TRUE) * 100.0 / NULLIF(COUNT(id) FILTER (WHERE is_closed = TRUE), 0) AS win_rate,
  AVG(amount) FILTER (WHERE is_won = TRUE) AS avg_deal_size
FROM sales_opportunities
WHERE close_date >= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '1 year')
GROUP BY 1, 2
HAVING COUNT(id) > 10
ORDER BY 1 DESC, 3 DESC;`,
      output: "Multi-Series Line Chart + Data Table",
      insight: "Inbound Organic search yields a 38% win rate with a $45k average deal size, statistically outperforming Outbound SDR pipelines."
    },
    useCases: [
      { title: 'CRO Board Reporting', description: 'Automate weekly sales forecasting models and executive presentations without writing complex spreadsheet macros or VLOOKUPs.' },
      { title: 'RevOps Alignment', description: 'Bridge the gap between marketing spend and closed-won sales by using AI to seamlessly join ad-spend tables with CRM pipeline data.' }
    ],
    faqs: [
      { q: 'What advanced metrics can Arcli calculate natively?', a: 'Beyond basic revenue totals, Arcli\'s engine is trained to calculate Win Rate, Average Deal Size, Sales Cycle Length (in days), and aggregate Pipeline Velocity using standard SQL.' },
      { q: 'Can I combine static quota spreadsheets with live CRM data?', a: 'Yes. You can upload static quota/commission CSVs into your Arcli workspace and command the AI to execute cross-joins against your live CRM database to track attainment.' }
    ],
    relatedSlugs: ['how-to-build-dashboard-from-csv', 'sales-dashboard-template']
  },

  'how-to-build-dashboard-from-csv': {
    type: 'guide',
    title: 'How to Build a Dashboard from a CSV File | Arcli',
    description: 'Learn the tactical methodology to turn massive, static CSV files into live, interactive business dashboards using in-browser WebAssembly.',
    h1: 'Building Dashboards from Massive CSVs',
    subtitle: 'Deploy ephemeral, in-browser WebAssembly (DuckDB) to convert massive static datasets into blazing-fast, interactive analytical suites.',
    icon: <FileText className="w-12 h-12 text-blue-400 mb-6" />,
    features: [
      'In-Browser DuckDB Processing', 
      'Conversational Pivot Generation', 
      'Secure Tenant-Isolated Sharing',
      'Handles 5M+ Rows Effortlessly'
    ],
    challengeContext: {
      traditionalMethod: 'Attempting to force large datasets into standard grid software (Excel/Sheets) or requiring data engineers to stand up temporary database tables for visualization.',
      bottlenecks: [
        'Grid-based spreadsheet applications face hard physical memory limits around 1.04 million rows.',
        'Executing pivot calculations on datasets exceeding 100k rows typically freezes the standard UI thread.',
        'Distributing raw CSVs via email poses severe data security risks and version-control fragmentation.'
      ]
    },
    executionStrategy: {
      approach: 'Client-side columnar processing. Arcli ingests the CSV, converts it to highly compressed Parquet format in-memory, and utilizes WebAssembly to execute SQL locally.',
      technicalEnablers: [
        'Embedded WebAssembly compute (WASM)',
        'Parquet columnar compression',
        'Zero-retention ephemeral architecture'
      ]
    },
    businessImpact: {
      metricImprovements: [
        'Process and visualize 5M+ rows without UI latency.',
        'Eliminates server-side upload wait times and processing queues.'
      ],
      workflowOptimization: 'Empowers operators to visualize and distribute insights from massive datasets instantly, without requiring intervention from data engineering or IT.'
    },
    steps: [
      { name: '1. Local Ingestion', text: 'Drag and drop massive CSVs into the interface. Data is processed locally within the browser sandbox for maximum privacy.' },
      { name: '2. Semantic Pivoting', text: 'The engine reads the headers. Describe your visual intent (e.g., "Show revenue by region and product category") to generate the UI.' },
      { name: '3. Publish & Distribute', text: 'Pin the generated React-Vega charts to a dashboard layout, securing a live-updating link for stakeholder distribution.' }
    ],
    realExample: {
      query: "Analyze this 2GB transaction log CSV. Show me the top 10 store locations by total sales volume, filtering out refunded transactions.",
      sql: `-- Executed instantly in-browser via WebAssembly DuckDB
SELECT 
  store_location, 
  SUM(transaction_amount) AS total_sales
FROM read_csv_auto('transactions_export_2024.csv')
WHERE status NOT IN ('refunded', 'failed')
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;`,
      output: "Interactive Horizontal Bar Chart",
      insight: "Automated extraction revealed the Downtown Chicago location generated $2.4M, outpacing the NY flagship store."
    },
    useCases: [
      { title: 'Ad-Hoc Financial Auditing', description: 'Instantly visualize massive general ledger exports from ERPs (Netsuite/SAP) to spot transactional anomalies without heavy BI setup.' },
      { title: 'Telemetry & Log Analysis', description: 'Ingest raw event logs from ad platforms or server endpoints to construct instant, shareable monitoring dashboards.' }
    ],
    faqs: [
      { q: 'Is there a file size limit for CSV ingestion?', a: 'Because Arcli processes CSVs using client-side WebAssembly and converts them to highly compressed Parquet binaries, you can comfortably process files up to 2GB directly in the browser.' },
      { q: 'Is my uploaded data secure?', a: 'Strictly yes. Standard CSV processing executes entirely client-side. The raw data never touches our backend servers, ensuring absolute compliance with enterprise data privacy policies.' }
    ],
    relatedSlugs: ['how-to-build-sql-dashboard', 'analyze-csv-with-ai']
  }
};