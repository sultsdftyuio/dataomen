import React from 'react';
import { TrendingUp, FileText, LayoutTemplate } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Search-Intent Machine" schema to capture high-intent users
 * looking for tactical solutions to specific analytical bottlenecks.
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

export const howToGuides: Record<string, SEOPageData> = {
  'how-to-analyze-sales-data': {
    type: 'guide',
    title: 'How to Analyze Sales Data with AI | Arcli Analytics',
    description: 'A step-by-step guide on analyzing sales data, pipeline velocity, and rep performance using high-performance AI and natural language.',
    h1: 'How to Analyze Sales Data Without Excel',
    subtitle: 'Learn how to automatically extract win rates, pipeline velocity, and forecasting metrics using vectorized AI operations instead of broken spreadsheets.',
    icon: <TrendingUp className="w-12 h-12 text-green-500 mb-6" />,
    features: [
      'Vectorized Pipeline Velocity Formulas', 
      'Automated Win/Loss Cohort Tracking', 
      'Linear Algebra Forecasting Models',
      'Instant CRM Integration (Salesforce/HubSpot)'
    ],
    painPoints: {
      title: 'Why Excel is Killing Your Sales Forecasting',
      points: [
        'Exporting CRM data to Excel immediately makes it stale and breaks version control.',
        'Calculating true pipeline velocity requires complex snapshotting that spreadsheets cannot handle.',
        'Sales operations teams spend 80% of their time building reports instead of analyzing the outcomes.'
      ],
      solution: 'Arcli connects directly to your CRM or data warehouse. Our AI understands your specific sales schema, allowing you to ask complex forecasting and velocity questions in plain English and get mathematically precise answers instantly.'
    },
    steps: [
      { name: '1. Connect Your Data', text: 'Securely connect your Salesforce, HubSpot, or SQL database. We pull the raw data into our high-speed columnar engine.' },
      { name: '2. Ask for Velocity', text: 'Type: "Calculate our pipeline velocity by sales rep for Q3." The Semantic Router instantly maps your schema to the formula.' },
      { name: '3. Generate Forecast', text: 'Ask the AI to project Q4 revenue based on historical win rates and open pipeline using precision EMA calculations.' }
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
      insight: "Inbound Organic search yields a 38% win rate with a $45k average deal size, significantly outperforming Outbound SDR efforts."
    },
    useCases: [
      { title: 'Sales Operations', description: 'Automate your weekly sales forecasting models and CRO board decks without writing complex spreadsheet macros.' },
      { title: 'RevOps Alignment', description: 'Instantly bridge the gap between marketing spend and closed-won sales by joining ad data with CRM pipeline.' }
    ],
    faqs: [
      { q: 'What metrics should I track for sales analysis?', a: 'To move beyond basic revenue, focus on Win Rate, Average Deal Size, Sales Cycle Length (in days), and Pipeline Velocity. Arcli calculates these natively.' },
      { q: 'Can I combine quota spreadsheets with my live CRM data?', a: 'Yes. You can upload your static quota/commission CSVs into Arcli and ask the AI to join it against your live CRM database to track attainment in real-time.' }
    ],
    relatedSlugs: ['analyze-salesforce-data', 'sales-dashboard-template']
  },

  'how-to-build-dashboard-from-csv': {
    type: 'guide',
    title: 'How to Build a Dashboard from a CSV File | Arcli',
    description: 'Learn how to instantly turn a massive, static CSV or Excel file into a live, interactive business dashboard using AI and in-browser WebAssembly.',
    h1: 'Turn Any CSV into an Interactive Dashboard in 60 Seconds',
    subtitle: 'Stop crashing Excel with million-row datasets. Upload your CSV and let our ephemeral, in-browser WebAssembly engine (DuckDB) generate a blazing-fast analytical suite.',
    icon: <FileText className="w-12 h-12 text-blue-400 mb-6" />,
    features: [
      'In-Browser DuckDB Processing (Zero Server Lag)', 
      'Auto-Pivot via Natural Language', 
      'Secure Tenant-Isolated Link Sharing',
      'Handles 5M+ Rows Effortlessly'
    ],
    painPoints: {
      title: 'The 1-Million Row Excel Limit',
      points: [
        'Excel and Google Sheets freeze, crash, or refuse to open CSV files with millions of rows.',
        'Building pivot tables on large datasets is painfully slow and prone to errors.',
        'Sharing static files via email creates massive security risks and "version_final_v3.xlsx" confusion.'
      ],
      solution: 'Arcli bypasses spreadsheet limits entirely. When you drop a CSV into Arcli, we convert it into an optimized Parquet file and query it using an in-browser DuckDB instance. This means you can query 5 million rows instantly, securely, entirely on your machine.'
    },
    steps: [
      { name: '1. Upload the File', text: 'Drag and drop your massive CSV into the secure Arcli interface. Data is processed locally for maximum privacy.' },
      { name: '2. Conversational Analysis', text: 'Our semantic engine reads the headers. Simply type what you want to see (e.g., "Show me revenue by region and product category").' },
      { name: '3. Publish & Share', text: 'Click "Pin" to build your dashboard layout, then share a secure, live-updating link with your team.' }
    ],
    realExample: {
      query: "Analyze this 2GB transaction log CSV. Show me the top 10 store locations by total sales volume, filtering out refunded or failed transactions.",
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
      insight: "The Downtown Chicago location generated $2.4M, outpacing the flagship NY store despite 40% less foot traffic."
    },
    useCases: [
      { title: 'Ad-Hoc Financial Reporting', description: 'Quickly visualize massive ledger exports from Netsuite or Quickbooks to spot anomalies without heavy BI setup.' },
      { title: 'Marketing Campaign Logs', description: 'Drop in massive raw event logs from your ad platforms to build instant ROAS dashboards.' }
    ],
    faqs: [
      { q: 'Is there a file size limit for CSV uploads?', a: 'Because Arcli processes CSVs using in-browser WebAssembly (DuckDB) and converts them to highly compressed Parquet formats, you can easily process files up to 2GB directly in your browser without waiting for server uploads.' },
      { q: 'Is my uploaded data secure?', a: 'Yes. Our standard CSV processor runs entirely client-side. Your raw data never touches our backend servers, ensuring strict compliance with data privacy policies.' }
    ],
    relatedSlugs: ['how-to-build-sql-dashboard', 'natural-language-to-sql']
  },

  'how-to-build-sql-dashboard': {
    type: 'guide',
    title: 'How to Build a SQL Dashboard Without Coding | Arcli',
    description: 'Learn how to connect your Postgres or Snowflake database and build an automated, live-updating SQL dashboard using context-aware AI.',
    h1: 'How to Build a SQL Dashboard in Minutes',
    subtitle: 'Stop writing boilerplate SQL and managing brittle semantic layers. Let Arcli\'s RAG AI write highly-optimized queries and build your dashboard interactively.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-400 mb-6" />,
    features: [
      'Auto-Generated, Highly Optimized SQL', 
      'Direct Database Read-Replica Syncing', 
      'Interactive Vectorized Cross-Filtering',
      'Context-Aware Schema Routing (Zero Hallucinations)'
    ],
    painPoints: {
      title: 'The Traditional BI Dashboard Bottleneck',
      points: [
        'Setting up a dashboard in Tableau or Looker requires weeks of defining semantic layers (LookML) and data models.',
        'Business users cannot answer their own ad-hoc questions and constantly interrupt the data engineering team.',
        'Traditional BI dashboards cache heavily, meaning your "live" dashboard is often 24 hours out of date.'
      ],
      solution: 'Arcli is a zero-setup intelligence layer. Point it at your read-replica database. We instantly map the schema relationships. You type questions in English, we execute pristine SQL, and your dashboard updates in real-time.'
    },
    steps: [
      { name: '1. Connect Database', text: 'Add your Postgres, MySQL, BigQuery, or Snowflake connection string via our secure, read-only integration layer.' },
      { name: '2. Ask for Metrics', text: 'Type: "Create a chart showing Daily Active Users alongside our Daily Server Error rate." The RAG engine handles the complex JOINs.' },
      { name: '3. Pin to Board', text: 'The AI executes the optimized SQL. Click "Pin to Dashboard" to add the resulting interactive charts to your live, multi-tenant workspace.' }
    ],
    realExample: {
      query: "Build a cohort retention matrix showing the percentage of users returning in months 1 through 6, grouped by the month they signed up.",
      sql: `WITH cohort_users AS (
  SELECT user_id, DATE_TRUNC('month', created_at) AS cohort_month
  FROM users
),
activity_months AS (
  SELECT user_id, DATE_TRUNC('month', event_date) AS activity_month
  FROM user_events
  GROUP BY 1, 2
)
SELECT 
  c.cohort_month,
  EXTRACT(MONTH FROM AGE(a.activity_month, c.cohort_month)) AS month_number,
  COUNT(DISTINCT c.user_id) AS active_users
FROM cohort_users c
JOIN activity_months a ON c.user_id = a.user_id
WHERE a.activity_month >= c.cohort_month
GROUP BY 1, 2
ORDER BY 1, 2;`,
      output: "Interactive Heatmap Matrix",
      insight: "Month-3 retention dropped from 42% to 28% for the September cohort, indicating a potential issue with the onboarding update released that month."
    },
    useCases: [
      { title: 'Product Analytics', description: 'Quickly spin up dashboards monitoring feature adoption, user drop-off, and DAU/MAU ratios without waiting for a data engineer.' },
      { title: 'Live Operational Monitoring', description: 'Build screens tracking live inventory levels, support ticket queues, or server health metrics.' }
    ],
    faqs: [
      { q: 'Can I view and edit the underlying SQL?', a: 'Absolutely. Arcli is built for engineers as well as operators. You can inspect, modify, and export the exact SQL queries generated by the AI to ensure total transparency and mathematical precision.' },
      { q: 'Is it safe to connect to my database?', a: 'Yes. We enforce strict read-only analytical connections. Furthermore, all query executions are wrapped in transaction blocks that proactively reject any INSERT, UPDATE, DELETE, or DROP operations before they reach your server.' }
    ],
    relatedSlugs: ['postgresql-text-to-sql', 'natural-language-to-sql']
  }
};