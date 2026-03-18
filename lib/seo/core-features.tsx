// lib/seo/core-features.tsx
import React from 'react';
import { Sparkles, LineChart, BarChart3, PieChart, FileSpreadsheet } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Search-Intent Machine" schema to capture high-intent users
 * looking to replace legacy BI, manual dashboarding, and brittle spreadsheets.
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

export const coreFeatures: Record<string, SEOPageData> = {
  'ai-data-analysis': {
    type: 'feature',
    title: 'AI Data Analysis Platform | Arcli Analytics',
    description: 'Transform raw data into actionable business intelligence instantly. Upload CSVs or connect databases for high-speed, zero-code AI data analysis.',
    h1: 'AI Data Analysis Built for Speed and Precision',
    subtitle: 'Stop waiting weeks for the data engineering team. Connect your data and let our AI engine uncover patterns, calculate complex metrics, and build verified models in seconds.',
    icon: <Sparkles className="w-12 h-12 text-blue-500 mb-6" />,
    features: [
      'Conversational Data Exploration', 
      'Automated Statistical Anomaly Detection', 
      'Linear Algebra Predictive Forecasting',
      'In-Browser Vectorized Compute (DuckDB)'
    ],
    painPoints: {
      title: 'The Data Bottleneck',
      points: [
        'Business users wait weeks in the BI queue just to get a simple question answered.',
        'Data analysts spend 80% of their time writing boilerplate SQL instead of actually finding insights.',
        'Exploratory data analysis (EDA) in Python or R requires heavy local environment setup and coding skills.'
      ],
      solution: 'Arcli democratizes exploratory analysis. Our semantic engine understands your database schema natively. You ask questions in plain English, and the AI translates them into highly optimized, dialect-specific SQL, rendering the results instantly.'
    },
    steps: [
      { name: '1. Connect Data', text: 'Securely connect your Postgres/Snowflake database or upload a massive CSV.' },
      { name: '2. Ask in Plain English', text: 'Type your question naturally (e.g., "Why did our retention drop last month?"). Our RAG AI maps the request to your schema.' },
      { name: '3. Instant Verified Insights', text: 'Our execution engine runs the generated SQL safely and builds an interactive dashboard instantly.' }
    ],
    realExample: {
      query: "Analyze our daily transaction volume for the last 90 days and flag any days where the volume was more than 2 standard deviations below the 7-day moving average.",
      sql: `WITH daily_stats AS (
  SELECT 
    DATE_TRUNC('day', created_at) AS date,
    COUNT(id) AS transaction_count
  FROM transactions
  WHERE created_at >= CURRENT_DATE - 90
  GROUP BY 1
),
moving_metrics AS (
  SELECT 
    date,
    transaction_count,
    AVG(transaction_count) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg,
    STDDEV(transaction_count) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as std_dev
  FROM daily_stats
)
SELECT 
  date, transaction_count, moving_avg,
  (transaction_count - moving_avg) / NULLIF(std_dev, 0) AS z_score
FROM moving_metrics
WHERE transaction_count < (moving_avg - (2 * std_dev))
ORDER BY date DESC;`,
      output: "Time-Series Line Chart with Red Anomaly Markers",
      insight: "Detected a critical 34% drop in transactions on October 12th, corresponding to the AWS us-east-1 outage."
    },
    comparison: {
      competitor: 'Python Pandas / Jupyter',
      competitorFlaws: [
        'Requires deep programming knowledge to set up and execute.',
        'Visualizations (Matplotlib/Seaborn) are static and hard to share interactively.',
        'Environment management (pip, conda) is a nightmare for non-engineers.'
      ],
      arcliWins: [
        'Zero setup: entire analysis environment runs securely in the browser.',
        'Interactive, publishable React-Vega charting built-in.',
        'Conversational interface entirely replaces writing Pandas syntax.'
      ]
    },
    useCases: [
      { title: 'Financial Variance Analysis', description: 'Automatically compare actuals vs. budget across hundreds of departments to find cost overruns instantly.' },
      { title: 'Product Telemetry', description: 'Drop in massive event logs to instantly visualize user drop-off points in your application funnel.' }
    ],
    faqs: [
      { q: 'Is it safe to let AI query my database?', a: 'Yes. Arcli only requires read-only credentials. Furthermore, our execution engine wraps every AI-generated query in a transaction block that actively rejects any mutating commands (INSERT, DELETE, DROP).' },
      { q: 'Can I see the math behind the AI\'s answer?', a: 'Always. We believe in "Trust, but Verify." You can inspect, edit, and export the exact SQL or execution logic the AI used to arrive at its conclusion.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'ai-business-intelligence', 'analyze-csv-with-ai']
  },

  'ai-business-intelligence': {
    type: 'feature',
    title: 'AI Business Intelligence Tools | Arcli',
    description: 'Empower your entire organization with AI-native Business Intelligence. Replace legacy BI tools with conversational analytics and semantic governance.',
    h1: 'Next-Generation AI Business Intelligence',
    subtitle: 'Give your operators the power of a dedicated data science team. Define your metrics once, and let your team ask questions, get answers, and drive revenue in plain English.',
    icon: <LineChart className="w-12 h-12 text-cyan-500 mb-6" />,
    features: [
      'Centralized Semantic Metric Governance', 
      'Conversational Dashboarding', 
      'Automated Root Cause Analysis (RCA)',
      'Scheduled Executive Briefings'
    ],
    painPoints: {
      title: 'Why Traditional BI Fails Modern Teams',
      points: [
        'Metric sprawl: Marketing defines "Active User" differently than Product, leading to conflicting board reports.',
        'Dashboards are brittle; if a user wants to view the data by a dimension not included in the original LookML model, they are stuck.',
        'Legacy BI tools (Tableau, PowerBI) have steep learning curves, restricting data access to a few certified analysts.'
      ],
      solution: 'Arcli introduces an AI-native semantic layer. You define the core logic for "Revenue" or "Active User" once. When anyone in the company asks a question in English, the AI perfectly utilizes those governed definitions to generate accurate, on-the-fly SQL and visualizations.'
    },
    steps: [
      { name: '1. Define Semantic Metrics', text: 'Set up your core KPIs and business logic once using our Semantic Governance layer (or import from dbt).' },
      { name: '2. Distribute Access', text: 'Give operators secure, natural language chat access to the BI engine.' },
      { name: '3. Automate Reporting', text: 'Schedule AI-generated insights and anomaly alerts to be delivered to Slack or Email weekly.' }
    ],
    realExample: {
      query: "Show me our Net Revenue Retention (NRR) for the current quarter, utilizing our official 'Enterprise_Revenue' semantic definition.",
      sql: `WITH starting_mrr AS (
  SELECT user_id, SUM(amount) as mrr
  FROM {{ ref('Enterprise_Revenue') }}
  WHERE date = DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '1 day'
  GROUP BY 1
),
current_mrr AS (
  SELECT user_id, SUM(amount) as mrr
  FROM {{ ref('Enterprise_Revenue') }}
  WHERE date = CURRENT_DATE
  GROUP BY 1
)
SELECT 
  SUM(c.mrr) * 100.0 / NULLIF(SUM(s.mrr), 0) AS net_revenue_retention
FROM starting_mrr s
LEFT JOIN current_mrr c ON s.user_id = c.user_id;`,
      output: "Gauge Chart with Historical Trendline",
      insight: "NRR is currently at 108%, driven entirely by expansion revenue in the EMEA region."
    },
    useCases: [
      { title: 'Cross-Functional Alignment', description: 'Ensure the CRO, CMO, and CPO are all looking at the exact same definition of "Pipeline" and "Conversion Rate."' },
      { title: 'Self-Serve Analytics', description: 'Empower Account Executives to pull their own custom usage reports for client QBRs without messaging the data team.' }
    ],
    faqs: [
      { q: 'Can Arcli integrate with our existing dbt models?', a: 'Yes. Arcli seamlessly integrates with modern data stack tools. We can read your dbt `schema.yml` files to instantly ingest your existing metric definitions and descriptions.' },
      { q: 'How do you prevent the LLM from hallucinating metrics?', a: 'We use strict Context-Aware Semantic Routing. The LLM is forced to route requests through your defined semantic layer formulas, preventing it from "guessing" how to calculate revenue.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'ai-dashboard-builder']
  },

  'ai-dashboard-builder': {
    type: 'feature',
    title: 'Automated AI Dashboard Builder | Arcli',
    description: 'Build beautiful, interactive business dashboards automatically using AI. Connect your database and get a full reporting suite without dragging a single widget.',
    h1: 'The Zero-Click AI Dashboard Builder',
    subtitle: 'Why drag and drop when AI can build it for you? Generate tailored, highly-interactive, and mathematically precise dashboards just by describing what you want.',
    icon: <BarChart3 className="w-12 h-12 text-purple-500 mb-6" />,
    features: [
      'Prompt-to-Dashboard Generation', 
      'Dynamic Chart Type Selection', 
      'Real-Time Database Sync Engine',
      'Secure iFrame Embeds'
    ],
    painPoints: {
      title: 'The Drag-and-Drop Fatigue',
      points: [
        'Building a dashboard in traditional tools requires manually configuring grid layouts, chart types, and color palettes for hours.',
        'Cross-filtering usually breaks unless complex relationship models are manually mapped in the UI.',
        'Mobile responsiveness in standard BI dashboards is notoriously terrible, requiring you to build the dashboard twice.'
      ],
      solution: 'Arcli utilizes an LLM-driven orchestration layer. You describe the audience and the goal (e.g., "A mobile-friendly daily sales health dashboard"). The AI writes the SQL, determines the best statistical visualizations (bar vs. line vs. scatter), and writes the React layout code dynamically.'
    },
    steps: [
      { name: '1. Connect Source', text: 'Link your database, API, or upload your raw files.' },
      { name: '2. Provide Prompt', text: 'Tell the AI what you want to track (e.g., "Build a comprehensive SaaS metrics dashboard tracking MRR, Churn, and LTV").' },
      { name: '3. Auto-Generate & Tweak', text: 'The AI builds the full suite. You can use natural language to tweak it ("Change the MRR chart to a stacked bar showing plan tiers").' }
    ],
    comparison: {
      competitor: 'Looker Studio / Tableau',
      competitorFlaws: [
        'Heavily reliant on manual UI configuration for every single visual element.',
        'Requires specialized training to understand the proprietary calculation languages (LookML / DAX).',
        'Dashboards load slowly due to heavy server-side rendering.'
      ],
      arcliWins: [
        'Generates full layouts via English prompts in seconds.',
        'Uses standard, transparent SQL under the hood for all logic.',
        'Lightning-fast rendering using in-browser WebAssembly and Vega-Lite.'
      ]
    },
    useCases: [
      { title: 'Agency Client Reporting', description: 'Automatically spin up white-labeled, real-time ROI dashboards for your marketing clients in minutes instead of days.' },
      { title: 'Incident Response Command Centers', description: 'During a server outage, ask the AI to instantly build a dashboard tracking error rates, latency, and active connections across specific microservices.' }
    ],
    faqs: [
      { q: 'Can I customize the generated dashboards manually if I want to?', a: 'Yes. The AI generates the high-quality baseline, but every chart, layout grid, and underlying SQL query is fully exposed for manual overriding and fine-tuning.' },
      { q: 'Do these dashboards update in real-time?', a: 'Yes. Unlike traditional cached BI, Arcli dashboards execute their optimized SQL directly against your database upon load, ensuring you always see the freshest data.' }
    ],
    relatedSlugs: ['ai-data-visualization-tool', 'how-to-build-sql-dashboard']
  },

  'ai-data-visualization-tool': {
    type: 'feature',
    title: 'AI Data Visualization Tool | Arcli',
    description: 'Turn complex datasets into beautiful, interactive charts instantly. Use our AI data visualization tool to generate Vega-Lite graphs without coding.',
    h1: 'AI-Powered Data Visualization Studio',
    subtitle: 'Stop wrestling with Excel chart formatting and D3.js libraries. Tell our semantic AI what you want to see, and it generates the perfect interactive visualization instantly.',
    icon: <PieChart className="w-12 h-12 text-pink-500 mb-6" />,
    features: [
      'Automated Chart Selection (Best-Fit Statistics)', 
      'High-Performance Vega-Lite Rendering', 
      'Interactive Tooltips & Cross-Filtering',
      'One-Click Export (PNG, SVG, JSON)'
    ],
    painPoints: {
      title: 'Why Most Charts Are Misleading',
      points: [
        'Users frequently choose the wrong chart type for their data (e.g., using a pie chart for time-series data).',
        'Building complex visualizations (like Sunbursts, Heatmaps, or Sankey diagrams) requires writing hundreds of lines of D3.js or Python code.',
        'Static image exports from Excel lack interactivity, making deep-dives impossible in presentations.'
      ],
      solution: 'Arcli acts as an expert data designer. The AI analyzes the dimensionality and cardinality of your result set and automatically selects the statistically appropriate visualization (React-Vega). It generates the interactive code natively.'
    },
    steps: [
      { name: '1. Select Data Payload', text: 'Upload your dataset, or let Arcli query your database to generate a result set.' },
      { name: '2. Conversational Generation', text: 'Type "Visualize our sales funnel drop-off rates." The AI builds the exact SQL and pairs it with a Funnel Chart.' },
      { name: '3. Style and Embed', text: 'Tweak colors to match your brand via chat, then copy the secure iframe snippet.' }
    ],
    realExample: {
      query: "Create a cohort retention heatmap showing the percentage of users active in months 1 through 6, grouped by their signup month.",
      sql: `-- AI generates the complex Cohort SQL, then pairs it with this Vega-Lite spec:
{
  "mark": "rect",
  "encoding": {
    "x": {"field": "month_number", "type": "ordinal", "title": "Months Since Signup"},
    "y": {"field": "cohort_month", "type": "ordinal", "title": "Cohort"},
    "color": {"field": "retention_pct", "type": "quantitative", "scale": {"scheme": "greens"}},
    "tooltip": [
      {"field": "retention_pct", "type": "quantitative", "format": ".1%"}
    ]
  }
}`,
      output: "Interactive Density Heatmap",
      insight: "Visual contrast immediately highlights that the July cohort had exceptionally poor Month-2 retention compared to the historical baseline."
    },
    useCases: [
      { title: 'Board Deck Preparation', description: 'Generate pixel-perfect, highly customized charts for executive presentations in seconds, bypassing the design team.' },
      { title: 'Web Application Embedding', description: 'Product teams can use Arcli to prototype complex D3/Vega visualizations and instantly copy the JSON spec into their own React codebase.' }
    ],
    faqs: [
      { q: 'Can I embed these charts into my own website?', a: 'Yes! Every generated chart provides a secure iframe snippet, or you can export the raw Vega-Lite JSON specification to render it natively in your own application.' },
      { q: 'Does it support complex chart types?', a: 'Absolutely. Beyond standard bar and line charts, Arcli\'s AI is trained to generate complex overlays, dual-axis charts, Sankey diagrams, heatmaps, and geographic scatter plots.' }
    ],
    relatedSlugs: ['ai-dashboard-builder', 'analyze-csv-with-ai']
  },

  'ai-excel-analysis': {
    type: 'feature',
    title: 'AI Excel & Spreadsheet Analysis Tool | Arcli',
    description: 'Upgrade your Excel workflows. Use AI to analyze large financial models, merge cross-sheet data, and bypass VBA macros effortlessly.',
    h1: 'AI-Powered Excel & Spreadsheet Analysis',
    subtitle: 'Excel is incredible for viewing data, but terrible for analyzing millions of rows. Let our AI handle the heavy lifting, broken VLOOKUPs, and VBA nightmares.',
    icon: <FileSpreadsheet className="w-12 h-12 text-green-600 mb-6" />,
    features: [
      'Handles 5M+ Row Workbooks Instantly', 
      'Conversational Cross-Sheet Joins', 
      'Bypass Brittle VBA Macros',
      'Automated Data Cleansing'
    ],
    painPoints: {
      title: 'The Nightmare of Excel at Scale',
      points: [
        'Excel crashes, freezes, or corrupts when files exceed a few hundred thousand rows.',
        'VLOOKUPs and INDEX/MATCH formulas break silently if a single column is inserted or moved.',
        'Writing and maintaining VBA macros requires legacy programming knowledge that slows down modern teams.'
      ],
      solution: 'Arcli extracts your Excel sheets into a high-performance, in-memory database (DuckDB). Instead of writing brittle cell formulas, you ask questions in English. We write indestructible SQL to join your sheets and aggregate the data instantly, handling millions of rows without a single crash.'
    },
    steps: [
      { name: '1. Upload Workbook', text: 'Drop your massive .xlsx or .csv files securely into our browser-based engine.' },
      { name: '2. AI Normalization', text: 'Our semantic engine automatically detects schemas, fixes broken date formats, and maps the relationships between different sheets.' },
      { name: '3. Conversational Pivots', text: 'Chat with your workbook. Ask "Join the Employee sheet with the Payroll sheet to show average salary by department" to instantly generate the summary.' }
    ],
    realExample: {
      query: "Clean this messy inventory export. Remove any rows where the SKU is blank, convert the 'Last_Stocked' text to a real date, and show me items out of stock.",
      sql: `-- Executed via DuckDB on the uploaded Excel file
SELECT 
  SKU_ID,
  Product_Name,
  CAST(STRPTIME(Last_Stocked_Text, '%m/%d/%Y') AS DATE) AS Last_Stocked_Date
FROM read_excel('inventory_messy.xlsx', sheet='Sheet1')
WHERE SKU_ID IS NOT NULL 
  AND SKU_ID != ''
  AND Current_Stock = 0
ORDER BY Last_Stocked_Date ASC;`,
      output: "Cleaned Data Grid & Bar Chart",
      insight: "Successfully cleaned 14,000 messy rows instantly. Identified 42 core products that have been out of stock for over 90 days."
    },
    comparison: {
      competitor: 'Excel Native Features (Pivot Tables / PowerQuery)',
      competitorFlaws: [
        'PowerQuery has a steep learning curve similar to learning a new programming language (M).',
        'Pivot tables on large datasets cause Excel to consume all system RAM and freeze.',
        'Difficult to share interactive findings without sending the massive underlying source file.'
      ],
      arcliWins: [
        'Zero code or formula syntax required. Driven entirely by natural language.',
        'Processes data externally in highly optimized columnar formats (Parquet) for infinite scale.',
        'Share findings via secure web links without exposing the raw underlying file data.'
      ]
    },
    useCases: [
      { title: 'Consolidating Regional Reports', description: 'Merge 15 different regional Excel reports into a single, cohesive AI dashboard using conversational commands instead of copy-pasting.' },
      { title: 'Financial Audit & Reconciliation', description: 'Quickly upload general ledgers and bank statements to instantly spot discrepancies and anomalies without writing complex matching macros.' }
    ],
    faqs: [
      { q: 'Does this overwrite or destroy my original Excel file?', a: 'Never. Arcli operates in a strict read-only analytical mode. We extract the data into our ephemeral memory for analysis, leaving your original `.xlsx` file completely untouched.' },
      { q: 'Can I export the cleaned and analyzed data back to Excel?', a: 'Yes. Once the AI has cleaned, joined, or pivoted your data, you can export the refined result set directly back to a clean CSV or Parquet file.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'how-to-build-dashboard-from-csv']
  }
};