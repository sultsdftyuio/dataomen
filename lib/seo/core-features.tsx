// lib/seo/core-features.tsx
import React from 'react';
import { Sparkles, LineChart, BarChart3, PieChart, FileSpreadsheet } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Architectural Contrast" schema. Focuses on objective, 
 * professional comparisons of underlying technologies, targeting high-intent 
 * enterprise buyers evaluating modern data stacks.
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
  theAlternative?: {
    title: string;
    focus: string[];
    arcliApproach: string;
  };
  useCases: { title: string; description: string }[];
  faqs: { q: string; a: string }[];
  comparison?: { 
    competitor: string; 
    theArcliAdvantage: string[]; 
    traditionalApproach: string[]; 
  };
  relatedSlugs: string[];
};

export const coreFeatures: Record<string, SEOPageData> = {
  'ai-data-analysis': {
    type: 'feature',
    title: 'AI Data Analysis Platform | Arcli Analytics',
    description: 'Transform raw data into actionable business intelligence instantly. Evaluate how Arcli\'s browser-native AI compute engine accelerates exploratory data analysis.',
    h1: 'AI Data Analysis Built for Agility and Precision',
    subtitle: 'Shift from heavy data engineering pipelines to instant, conversational exploration. Connect your data and let our AI engine calculate complex metrics in seconds.',
    icon: <Sparkles className="w-12 h-12 text-blue-500 mb-6" />,
    features: [
      'Conversational Data Exploration', 
      'Automated Statistical Anomaly Detection', 
      'Linear Algebra Predictive Forecasting',
      'In-Browser Vectorized Compute (DuckDB)'
    ],
    theAlternative: {
      title: 'Programmatic Environments vs. Conversational UI',
      focus: [
        'Exploratory Data Analysis (EDA) traditionally requires deep expertise in Python, Pandas, or R.',
        'Data analysts dedicate significant time to writing boilerplate SQL and managing local compute environments.',
        'Sharing interactive programmatic findings requires deploying secondary applications (like Streamlit or Dash).',
        'Business stakeholders are reliant on a centralized data queue for complex ad-hoc questions.'
      ],
      arcliApproach: 'Arcli democratizes exploratory analysis through a semantic engine that understands your database schema natively. By compiling plain English into highly optimized, dialect-specific SQL, Arcli provides the analytical depth of a programmatic environment with the accessibility of a chat interface.'
    },
    steps: [
      { name: '1. Secure Connection', text: 'Connect your Postgres/Snowflake instance or upload analytical datasets directly.' },
      { name: '2. Natural Language Exploration', text: 'Ask questions naturally (e.g., "Analyze last month\'s retention drop"). Our RAG AI maps the request to your schema.' },
      { name: '3. Instant Verified Insights', text: 'The execution engine runs the generated logic safely, rendering a dynamic dashboard instantly.' }
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
      output: "Time-Series Line Chart with Anomaly Markers",
      insight: "Detected a statistically significant variance in transactions corresponding to external infrastructure events."
    },
    comparison: {
      competitor: 'Python/Pandas Ecosystem',
      theArcliAdvantage: [
        'Zero environment setup: the entire analysis engine runs securely in the browser.',
        'Interactive, publishable React-Vega charting is generated natively.',
        'Conversational interface bypasses the need for specialized Pandas syntax.'
      ],
      traditionalApproach: [
        'Requires deep programming knowledge to configure and execute.',
        'Standard visualizations (e.g., Matplotlib) are often static and require extra steps to share interactively.',
        'Environment management creates friction for non-engineering stakeholders.'
      ]
    },
    useCases: [
      { title: 'Financial Variance Analysis', description: 'Quickly compare actuals vs. budget across multiple departments to identify spending trends.' },
      { title: 'Product Telemetry', description: 'Analyze event logs to visualize user progression and identify funnel drop-off points.' }
    ],
    faqs: [
      { q: 'Is it safe to let AI query my database?', a: 'Yes. Arcli operates strictly on read-only credentials. Our execution engine wraps every query in a transaction block that actively drops mutating commands.' },
      { q: 'Can I verify the underlying logic?', a: 'Always. We follow a "Trust, but Verify" principle. You can inspect, edit, and export the exact SQL the AI utilized to arrive at its conclusion.' }
    ],
    relatedSlugs: ['natural-language-to-sql', 'ai-business-intelligence', 'analyze-csv-with-ai']
  },

  'ai-business-intelligence': {
    type: 'feature',
    title: 'AI Business Intelligence Tools | Arcli',
    description: 'Empower your organization with AI-native Business Intelligence. Evaluate how Arcli combines conversational analytics with strict semantic governance.',
    h1: 'Next-Generation AI Business Intelligence',
    subtitle: 'Deploy enterprise-grade analytics powered by generative AI. Define your core metrics once, and allow your team to explore data securely in plain English.',
    icon: <LineChart className="w-12 h-12 text-cyan-500 mb-6" />,
    features: [
      'Centralized Semantic Metric Governance', 
      'Conversational Dashboarding', 
      'Automated Root Cause Analysis (RCA)',
      'Scheduled Executive Briefings'
    ],
    theAlternative: {
      title: 'Rigid Modeling vs. Dynamic Governance',
      focus: [
        'Traditional BI relies on highly rigid semantic layers that require dedicated engineering teams to maintain.',
        'Metric definitions often become fragmented across disparate dashboards, leading to conflicting reports.',
        'Business users are constrained by predefined dashboard filters; answering a new question requires a new engineering request.',
        'Adoption is limited by the steep learning curve of proprietary BI interfaces.'
      ],
      arcliApproach: 'Arcli utilizes a dynamic Semantic Governance layer. You centrally define core business logic (like "Active User" or "Net Revenue"). When a user asks a question naturally, the AI automatically routes the query through these governed definitions, ensuring complete mathematical consistency without locking users into rigid dashboard views.'
    },
    steps: [
      { name: '1. Define Semantic Metrics', text: 'Establish your core KPIs once using our Governance layer (or import directly from dbt).' },
      { name: '2. Democratize Access', text: 'Provide operators with a secure, natural language interface to query the governed BI engine.' },
      { name: '3. Automate Delivery', text: 'Schedule AI-generated insights and formatted alerts for delivery to Slack or Email.' }
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
      insight: "NRR calculated seamlessly utilizing centrally governed dbt models."
    },
    comparison: {
      competitor: 'Traditional BI Suites',
      theArcliAdvantage: [
        'AI maps natural language directly to centrally governed metric definitions.',
        'Empowers true self-serve analytics for non-technical operators.',
        'Integrates natively with existing modern data stack tools like dbt.'
      ],
      traditionalApproach: [
        'Requires specialized knowledge of proprietary modeling languages (LookML/DAX).',
        'Lengthy turnaround times for ad-hoc analytical requests.',
        'High licensing costs for basic "Viewer" access.'
      ]
    },
    useCases: [
      { title: 'Cross-Functional Alignment', description: 'Ensure the CRO, CMO, and CPO are analyzing the exact same semantic definitions for "Pipeline" and "Conversion Rate."' },
      { title: 'Operator Independence', description: 'Enable Account Executives to generate custom usage reports for client reviews without waiting for an analyst.' }
    ],
    faqs: [
      { q: 'Can Arcli integrate with our existing dbt models?', a: 'Yes. Arcli reads your dbt `schema.yml` files to instantly ingest your existing metric definitions and descriptions into our semantic router.' },
      { q: 'How do you prevent the LLM from hallucinating metrics?', a: 'We employ strict Context-Aware Semantic Routing. The LLM is programmatically forced to route specific requests through your defined formulas, preventing mathematical hallucinations.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'ai-dashboard-builder']
  },

  'ai-dashboard-builder': {
    type: 'feature',
    title: 'Automated AI Dashboard Builder | Arcli',
    description: 'Transition from manual UI configuration to generative design. Use Arcli to build interactive business dashboards automatically via natural language.',
    h1: 'The Generative AI Dashboard Builder',
    subtitle: 'Move beyond manual widget configuration. Describe your reporting goals, and Arcli\'s orchestration engine generates tailored, interactive layouts instantly.',
    icon: <BarChart3 className="w-12 h-12 text-purple-500 mb-6" />,
    features: [
      'Prompt-to-Dashboard Generation', 
      'Dynamic Chart Type Selection', 
      'Real-Time Database Sync',
      'Secure iFrame Embeds'
    ],
    theAlternative: {
      title: 'Manual UI Configuration vs. Intent-Driven Layouts',
      focus: [
        'Standard dashboard builders require manual, grid-based configuration of every individual chart and filter.',
        'Cross-filtering behavior must be explicitly mapped between different data sources.',
        'Iterating on a dashboard\'s design (e.g., swapping line charts for bar charts) is a tedious, click-heavy process.',
        'Mobile responsiveness often requires building a secondary layout manually.'
      ],
      arcliApproach: 'Arcli introduces an intent-driven generation layer. You describe the audience and the objective (e.g., "A daily sales health dashboard"). The AI authors the underlying SQL, selects the statistically optimal visualizations, and generates the responsive React layout code dynamically.'
    },
    steps: [
      { name: '1. Connect the Source', text: 'Authenticate your data warehouse or upload analytical files.' },
      { name: '2. Provide the Prompt', text: 'Describe your tracking requirements (e.g., "Build a comprehensive SaaS metrics dashboard tracking MRR and Churn").' },
      { name: '3. Generate and Refine', text: 'The AI constructs the suite. You can refine it conversationally ("Segment the MRR chart by geographic region").' }
    ],
    comparison: {
      competitor: 'Manual Dashboard Builders',
      theArcliAdvantage: [
        'Generates comprehensive layouts via natural language prompts in seconds.',
        'Utilizes transparent, standard SQL under the hood for all visual logic.',
        'High-performance rendering via in-browser WebAssembly and Vega-Lite.'
      ],
      traditionalApproach: [
        'Heavily reliant on manual UI configuration for every visual element.',
        'Requires deep familiarity with the tool\'s specific visualization limitations.',
        'Often suffers from slow load times due to heavy server-side rendering.'
      ]
    },
    useCases: [
      { title: 'Rapid Client Reporting', description: 'Quickly generate tailored, white-labeled performance dashboards for clients or stakeholders.' },
      { title: 'Incident Response', description: 'Instantly build targeted dashboards tracking system telemetry and error rates during operational anomalies.' }
    ],
    faqs: [
      { q: 'Can I customize the generated dashboards manually?', a: 'Yes. The AI provides a high-quality baseline, but every chart, layout parameter, and underlying SQL query is exposed for manual fine-tuning.' },
      { q: 'Do these dashboards update in real-time?', a: 'Yes. Arcli dashboards execute optimized SQL directly against your read-replica upon load, ensuring stakeholders view current data.' }
    ],
    relatedSlugs: ['ai-data-visualization-tool', 'how-to-build-sql-dashboard']
  },

  'ai-data-visualization-tool': {
    type: 'feature',
    title: 'AI Data Visualization Tool | Arcli',
    description: 'Transform complex result sets into mathematically precise charts. Use Arcli\'s AI to generate interactive Vega-Lite visualizations automatically.',
    h1: 'Automated Statistical Data Visualization',
    subtitle: 'Streamline the visualization process. Arcli analyzes your data\'s dimensionality and automatically generates the most effective interactive charts.',
    icon: <PieChart className="w-12 h-12 text-pink-500 mb-6" />,
    features: [
      'Automated Statistical Chart Selection', 
      'High-Performance Vega-Lite Rendering', 
      'Interactive Tooltips & Cross-Filtering',
      'JSON Specification Export'
    ],
    theAlternative: {
      title: 'Manual Chart Libraries vs. Automated Generation',
      focus: [
        'Building complex, interactive charts traditionally requires authoring hundreds of lines of code using libraries like D3.js or Plotly.',
        'Non-technical users frequently select suboptimal chart types (e.g., using pie charts for deep time-series data).',
        'Standard spreadsheet charting tools produce static images that lack the interactivity required for deep presentations.',
        'Ensuring visual consistency across a large organization requires strict manual design guidelines.'
      ],
      arcliApproach: 'Arcli acts as an automated data designer. The AI evaluates the cardinality, temporal nature, and quantitative spread of your result set to select the statistically appropriate visualization. It natively generates a robust React-Vega implementation, ensuring interactivity and design consistency.'
    },
    steps: [
      { name: '1. Establish Data Payload', text: 'Upload a dataset or allow Arcli to execute a query against your warehouse.' },
      { name: '2. Conversational Rendering', text: 'Request a visual output (e.g., "Visualize the cohort drop-off matrix"). The AI generates both the logic and the chart.' },
      { name: '3. Embed and Export', text: 'Export the visualization as a high-res image, or copy the Vega-Lite JSON specification for use in your own app.' }
    ],
    realExample: {
      query: "Create a cohort retention heatmap showing the percentage of users active in months 1 through 6, grouped by signup month.",
      sql: `-- The AI evaluates the dense matrix output and generates the optimal Vega-Lite spec:
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
      insight: "Automated visualization correctly highlights specific cohort anomalies without requiring manual color-scale configuration."
    },
    comparison: {
      competitor: 'Code-Heavy Charting Libraries (D3.js)',
      theArcliAdvantage: [
        'Zero code required; chart specifications are generated entirely via intent.',
        'Guarantees statistically appropriate chart selection based on data shape.',
        'Native cross-filtering and tooltip interactivity built-in.'
      ],
      traditionalApproach: [
        'Requires specialized front-end engineering expertise to implement.',
        'Time-consuming to iterate on visual designs or swap chart paradigms.',
        'High maintenance overhead when underlying data structures change.'
      ]
    },
    useCases: [
      { title: 'Executive Presentations', description: 'Generate highly customized, interactive charts for strategic reviews in seconds.' },
      { title: 'Application Prototyping', description: 'Product engineers can use Arcli to prototype complex visualizations and seamlessly copy the JSON spec into their own React codebase.' }
    ],
    faqs: [
      { q: 'Can I embed these charts into my own web application?', a: 'Yes. Every generated chart provides a secure iframe, or you can export the raw Vega-Lite JSON to render it natively using your own front-end components.' },
      { q: 'Does the AI support advanced chart configurations?', a: 'Absolutely. Arcli is trained to generate complex overlays, dual-axis formats, Sankey diagrams, and geographic density plots.' }
    ],
    relatedSlugs: ['ai-dashboard-builder', 'analyze-csv-with-ai']
  },

  'ai-excel-analysis': {
    type: 'feature',
    title: 'AI Spreadsheet Analysis Engine | Arcli',
    description: 'Upgrade your spreadsheet workflows. Evaluate how Arcli\'s columnar engine processes millions of rows and bypasses complex macro limitations.',
    h1: 'High-Performance Spreadsheet Analysis',
    subtitle: 'Spreadsheets are excellent for data entry, but struggle at scale. Arcli leverages vectorized compute to analyze massive datasets via natural language.',
    icon: <FileSpreadsheet className="w-12 h-12 text-green-600 mb-6" />,
    features: [
      'Infinite Scale via Columnar Processing', 
      'Conversational Cross-Sheet Joins', 
      'Automated Data Normalization',
      'Zero VBA Required'
    ],
    theAlternative: {
      title: 'In-Memory Cells vs. Vectorized Analytics',
      focus: [
        'Traditional spreadsheets struggle or crash when processing files exceeding a few hundred thousand rows.',
        'Cell-based reference formulas (like VLOOKUP or INDEX/MATCH) are rigid and break if underlying structures shift.',
        'Automating repetitive spreadsheet tasks often requires maintaining complex legacy VBA macros.',
        'Merging disparate files requires tedious manual data alignment and cleansing.'
      ],
      arcliApproach: 'Arcli extracts spreadsheet data into a high-performance analytical engine (DuckDB). By transitioning from cell-based logic to columnar SQL execution, you can join, pivot, and analyze millions of rows instantly using plain English—bypassing the memory constraints of traditional grid applications.'
    },
    steps: [
      { name: '1. Secure Upload', text: 'Ingest massive .xlsx or .csv files directly into the browser-based engine.' },
      { name: '2. Schema Inference', text: 'Arcli automatically infers data types, normalizes date formats, and maps potential sheet relationships.' },
      { name: '3. Conversational Analytics', text: 'Query the data seamlessly (e.g., "Join the Employee and Payroll sheets to show average salary by department").' }
    ],
    realExample: {
      query: "Clean this inventory export. Remove rows missing a SKU, convert the 'Last_Stocked' text to a valid date, and identify items out of stock.",
      sql: `-- Executed via embedded DuckDB on the ingested file:
SELECT 
  SKU_ID,
  Product_Name,
  CAST(STRPTIME(Last_Stocked_Text, '%m/%d/%Y') AS DATE) AS Last_Stocked_Date
FROM read_excel('inventory_export.xlsx', sheet='Sheet1')
WHERE SKU_ID IS NOT NULL 
  AND SKU_ID != ''
  AND Current_Stock = 0
ORDER BY Last_Stocked_Date ASC;`,
      output: "Cleaned Data Grid & Status Chart",
      insight: "Cleaned thousands of rows and executed conditional logic instantly, bypassing manual row filtering."
    },
    comparison: {
      competitor: 'Traditional Spreadsheet Software',
      theArcliAdvantage: [
        'Processes data in highly optimized columnar formats (Parquet) for immense scale.',
        'Replaces rigid cell formulas with robust, natural language-driven SQL logic.',
        'Enables sharing of interactive insights without exposing the raw underlying file.'
      ],
      traditionalApproach: [
        'Memory limits often cause application freezing during heavy pivot table calculations.',
        'Advanced data shaping requires learning new languages like PowerQuery (M).',
        'High risk of manual errors when writing cross-sheet cell formulas.'
      ]
    },
    useCases: [
      { title: 'Financial Consolidation', description: 'Merge regional reporting sheets into a unified, clean analytical view using conversational commands.' },
      { title: 'Audit & Reconciliation', description: 'Upload general ledgers to quickly identify data discrepancies and anomalies via automated SQL matching.' }
    ],
    faqs: [
      { q: 'Does this modify my original file?', a: 'No. Arcli operates in a strict read-only capacity. Data is extracted into an ephemeral memory space for analysis, leaving your original file completely untouched.' },
      { q: 'Can I export the aggregated results?', a: 'Yes. Once the AI has processed and joined your data, the refined result set can be exported back to a standard CSV or Parquet file for downstream use.' }
    ],
    relatedSlugs: ['analyze-csv-with-ai', 'how-to-build-dashboard-from-csv']
  }
};