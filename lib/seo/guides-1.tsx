import { SEOPageData } from './database-integrations-1';

export const howToGuidesPart1: Record<string, SEOPageData> = {
  'how-to-analyze-sales-data': {
    type: 'guide',
    title: 'How to Analyze Sales Data with AI | Arcli Analytics',
    description: 'A step-by-step guide to analyzing sales data, pipeline velocity, and rep performance using deterministic AI. Replace static spreadsheet models with live forecasting.',
    metaKeywords: [
      'how to analyze sales data', 
      'sales data analysis example', 
      'sales analytics tools', 
      'RevOps analytics', 
      'conversational BI', 
      'pipeline velocity tracking'
    ],
    
    h1: 'How to Analyze Sales Data (Step-by-Step Guide)',
    subtitle: 'Use AI to extract pipeline velocity, win rates, and accurate revenue forecasts instantly. Stop waiting for RevOps to build static spreadsheet models.',
    icon: 'TrendingUp', // V13 STRICT: String serialization only
    schemaMarkup: 'HowTo',
    quickAnswer: "The most efficient way to analyze sales data is to bypass manual CSV exports and connect your CRM directly to a real-time semantic engine. By using conversational AI, you can generate deterministic SQL queries that instantly calculate win rates, pipeline velocity, and revenue forecasts without relying on brittle spreadsheet macros.",
    
    blocks: [
        {
            type: 'ContrarianBanner',
            data: {
                statement: 'Relying on "gut feeling" rep forecasts instead of historical statistical trajectories and pipeline momentum is a critical mistake. Stop exporting stale CSVs that cause reports to be outdated before the executive meeting even starts.'
            },
            purpose: 'Challenge common mistakes in sales forecasting',
            intentServed: 'Informational'
        },
        {
            type: 'InformationGain',
            data: {
                headline: 'The Business Impact of Deterministic Sales Analytics',
                metrics: [
                    { label: 'Forecasting Accuracy', value: 'Highly Predictable', description: 'Replaces gut-feeling sales forecasts with mathematically verified, dynamically calculated pipeline trajectories based on true historical win rates.' },
                    { label: 'Reporting Latency', value: 'Instantaneous', description: 'Eliminates the 3-day turnaround time typically required for a RevOps analyst to pull, clean, and visualize Salesforce or HubSpot data.' }
                ],
                workflowBefore: [
                    'Exporting live CRM data instantly creates disconnected, stale snapshots.',
                    'Calculating true pipeline velocity requires complex cohort math that crashes standard grid software.',
                    'Sales operations teams dedicate excessive weekly cycles to maintaining reporting infrastructure rather than driving strategy.'
                ],
                workflowAfter: [
                    '73% of sales leaders rely on outdated spreadsheet data for weekly forecasting, missing critical pipeline shifts.',
                    'Arcli executes math directly in your warehouse, ensuring absolute security and real-time freshness (0 Egress).'
                ]
            },
            purpose: 'Highlight ROI and current bottlenecks',
            intentServed: 'Commercial Investigation'
        },
        {
            type: 'ArchitectureDiagram',
            data: {
                title: 'Semantic Execution Strategy',
                steps: [
                    { title: '1. Connect CRM', description: 'Provide Arcli with a read-only credential to your CRM data warehouse.' },
                    { title: '2. Semantic Indexing', description: 'Allow the Semantic Router to securely index custom fields and business logic.' },
                    { title: '3. Conversational Extraction', description: 'Type your query in natural language (e.g., "Show pipeline velocity by region for Q3").' },
                    { title: '4. Review SQL', description: 'Review the generated deterministic SQL to ensure full transparency.' },
                    { title: '5. Strategic Distribution', description: 'Pin the resulting interactive chart to your live Sales War Room dashboard.' }
                ]
            },
            purpose: 'Provide a clear, step-by-step methodology',
            intentServed: 'How-to'
        },
        {
            type: 'ComparisonMatrix',
            data: {
                title: 'Data Freshness & Interface Comparison',
                headers: ['Feature', 'Arcli', 'Traditional Method'],
                rows: [
                    { category: 'Data Freshness', arcliAdvantage: 'Live (Direct Warehouse Query)', legacy: 'Stale (Manual CSV Exports)' },
                    { category: 'Forecasting Method', arcliAdvantage: 'Deterministic Cohort Math', legacy: 'Rep "Gut Feeling" Rollups' },
                    { category: 'Query Interface', arcliAdvantage: 'Conversational Natural Language', legacy: 'Complex Pivot Tables / VLOOKUP' }
                ]
            },
            purpose: 'Contrast conversational BI against traditional spreadsheets',
            intentServed: 'Comparison'
        },
        {
            type: 'MetricsChart',
            data: {
                title: 'Live Deal Size & Win Rate Analysis',
                codeSnippet: {
                    language: 'sql',
                    code: "SELECT \n  DATE_TRUNC('quarter', close_date) AS quarter, \n  lead_source, \n  COUNT(id) FILTER (WHERE is_won = TRUE) * 100.0 / NULLIF(COUNT(id) FILTER (WHERE is_closed = TRUE), 0) AS win_rate, \n  AVG(amount) FILTER (WHERE is_won = TRUE) AS avg_deal_size \nFROM sales_opportunities \nWHERE close_date >= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '1 year') \nGROUP BY 1, 2 \nHAVING COUNT(id) > 10 \nORDER BY 1 DESC, 3 DESC;"
                },
                governedOutputs: [
                    { label: "Inbound Win Rate", value: "38%", status: "trend-up" },
                    { label: "Avg Deal Size", value: "$45k", status: "neutral" }
                ]
            },
            purpose: 'Visually prove the capability of the generated SQL',
            intentServed: 'Informational'
        },
        {
            type: 'AnalyticsDashboard',
            data: {
                scenarios: [
                    {
                        title: 'Sales Cycle Bottleneck Identification',
                        complexity: 'Advanced',
                        businessQuestion: 'What is the average number of days deals spend in the "Legal Review" stage before moving to "Closed Won"?',
                        businessOutcome: 'Isolates severe operational friction, empowering leadership to standardize enterprise contracts and accelerate closing velocity.'
                    },
                    {
                        title: 'Predictive Churn & Renewal Modeling',
                        complexity: 'Strategic',
                        businessQuestion: 'Identify enterprise accounts renewing in the next 90 days where platform usage has dropped by more than 20%.',
                        businessOutcome: 'Generates a proactive "At-Risk" target list for Customer Success interventions, protecting ARR.'
                    }
                ]
            },
            purpose: 'Demonstrate concrete, real-world analytical scenarios',
            intentServed: 'How-to'
        },
        {
            type: 'SecurityGuardrails',
            data: {
                principles: [
                    { title: 'Zero-Data Movement', description: 'Arcli does not ingest highly confidential CRM data. We send the generated SQL to your database to process the math, and only retrieve final aggregated numbers.' },
                    { title: 'No Hallucinations', description: 'We do not use LLMs to guess or generate answers. The AI acts purely as a semantic translator, reading validated schema to author deterministic SQL.' },
                     { title: 'Technical Enabler: Zero-ETL', description: 'Direct Database Synchronization (Zero-ETL).' },
                     { title: 'Technical Enabler: Advanced Math', description: 'Vectorized Exponential Moving Average (EMA) tracking.' }
                ]
            },
            purpose: 'Address security concerns and highlight technical enablers',
            intentServed: 'Commercial Investigation'
        },
        {
            type: 'CTAGroup',
            data: {
                primaryLabel: 'Analyze your live sales data in seconds.',
                primaryHref: '/register?intent=sales_analytics',
                secondaryLabel: 'Start Free Trial',
                secondaryHref: '/register'
            },
            purpose: 'Drive conversion through defined CTAs',
            intentServed: 'Commercial Investigation'
        }
    ],
    faqs: [
      { q: 'Does Arcli ingest our highly confidential CRM data?', a: 'No. Arcli operates a strict Zero-Data Movement architecture. We send the generated SQL to your database to process the math, and only retrieve the final aggregated numbers needed to draw the charts in the browser.', intent: 'Security', schemaEnabled: true },
      { q: 'How do you prevent AI hallucinations when forecasting?', a: 'We do not use LLMs to guess or generate answers. The AI acts purely as a semantic translator, reading your validated database schema to author deterministic SQL. The actual math and forecasting are executed flawlessly by your database engine.', intent: 'Accuracy', schemaEnabled: true }
    ],
    relatedSlugs: [
      { label: 'Build Dashboard from CSV', slug: '/seo/how-to-build-dashboard-from-csv', intent: 'Supporting' },
      { label: 'Build SQL Dashboard', slug: '/seo/how-to-build-sql-dashboard', intent: 'Supporting' }
    ]
  },

  'how-to-build-dashboard-from-csv': {
    type: 'guide',
    title: 'How to Build a Dashboard from a CSV File | Arcli',
    description: 'Learn how to turn massive, static CSV files into live, interactive business dashboards using secure, in-browser WebAssembly AI processing.',
    metaKeywords: [
      'how to build a dashboard from a csv', 
      'csv dashboard tool', 
      'analyze large csv files', 
      'webassembly data processing', 
      'local csv analytics',
      'duckdb wasm analytics'
    ],
    
    h1: 'How to Build a Dashboard from a CSV File (Fast & Secure)',
    subtitle: 'Deploy secure, in-browser WebAssembly to convert multi-gigabyte data dumps into blazing-fast, interactive analytical suites in seconds.',
    icon: 'FileText',
    schemaMarkup: 'HowTo',
    quickAnswer: "To build a dashboard from a massive CSV file without crashing Excel, utilize a WebAssembly-powered analytics engine like Arcli. Drag and drop the CSV into your browser, where it is instantly converted into a highly compressed local DuckDB database. You can then use natural language to generate instant, interactive dashboard widgets without server uploads.",

    blocks: [
        {
            type: 'ContrarianBanner',
            data: {
                statement: 'Stop trying to force 2GB log files into Excel, leading to memory crashes. Do not upload highly confidential HR/Financial CSVs to public AI servers, violating InfoSec policies.'
            },
            purpose: 'Highlight the dangers of legacy methods for large files',
            intentServed: 'Informational'
        },
        {
            type: 'InformationGain',
            data: {
                headline: 'The Power of WebAssembly Data Processing',
                metrics: [
                    { label: 'Data Processing Capacity', value: 'Unlimited (Client-Side)', description: 'Easily visualizes datasets that immediately crash or freeze standard desktop spreadsheet applications.' },
                    { label: 'Information Security', value: 'Absolute', description: 'Because files are processed locally in your browser via WASM, sensitive data is never exposed to external cloud servers.' }
                ],
                workflowBefore: [
                    'Grid-based spreadsheet applications hit physical limits at 1.04 million rows.',
                    'Executing pivot calculations on datasets exceeding 100k rows freezes the UI thread.',
                    'Uploading confidential raw CSVs to third-party dashboarding tools poses severe compliance risks.'
                ],
                workflowAfter: [
                    '10M+ Rows: Process massive logs instantly entirely within your browser UI thread without freezing.',
                    '100% Private: Raw CSV data never leaves your local machine, ensuring full SOC2/GDPR compliance.'
                ]
            },
            purpose: 'Quantify the benefits of local WASM processing',
            intentServed: 'Commercial Investigation'
        },
        {
            type: 'ArchitectureDiagram',
            data: {
                title: 'Client-Side Columnar Processing Pipeline',
                steps: [
                    { title: '1. Export Data', description: 'Export your massive CSV from your ERP or Log system.' },
                    { title: '2. Secure Local Ingestion', description: 'Drag and drop the file directly into the Arcli interface. Data is processed instantly within your browser’s secure sandbox.' },
                    { title: '3. WebAssembly Conversion', description: 'Wait seconds for local WASM to infer data types and compress the file into memory.' },
                    { title: '4. Conversational Pivoting', description: 'Ask conversational queries (e.g., "Group total spend by region and filter by Q2").' },
                    { title: '5. Dashboard Assembly', description: 'Pin the generated charts to an interactive, shareable dashboard.' }
                ]
            },
            purpose: 'Explain the technical process of WASM CSV ingestion',
            intentServed: 'How-to'
        },
        {
            type: 'ComparisonMatrix',
            data: {
                title: 'Handling Massive CSV Files',
                headers: ['Feature', 'Arcli (WASM)', 'Traditional Method'],
                rows: [
                    { category: 'Row Limit', arcliAdvantage: 'Hardware Limited (10M+ Rows)', legacy: '~1.04 Million (Excel)' },
                    { category: 'Data Privacy', arcliAdvantage: '100% Local Browser Sandbox', legacy: 'Risky Cloud Uploads (SaaS BI)' },
                    { category: 'Speed to Insight', arcliAdvantage: 'Seconds via Conversational AI', legacy: 'Hours of formatting / crashing' }
                ]
            },
            purpose: 'Contrast Arcli against Excel and Cloud BI tools',
            intentServed: 'Comparison'
        },
        {
            type: 'MetricsChart',
            data: {
                title: 'Instant 2GB Transaction Log Analysis',
                codeSnippet: {
                    language: 'sql',
                    code: "-- Executed instantly in-browser via WebAssembly DuckDB\nSELECT \n  store_location, \n  SUM(transaction_amount) AS total_sales \nFROM read_csv_auto('transactions_export_2024.csv') \nWHERE status NOT IN ('refunded', 'failed') \nGROUP BY 1 \nORDER BY 2 DESC \nLIMIT 10;"
                },
                governedOutputs: [
                    { label: "Downtown Chicago", value: "$2.4M", status: "trend-up" },
                    { label: "New York Flagship", value: "$1.8M", status: "neutral" }
                ]
            },
            purpose: 'Visually prove capability with a concrete SQL example',
            intentServed: 'Informational'
        },
        {
            type: 'AnalyticsDashboard',
            data: {
                scenarios: [
                    {
                        title: 'Marketing Spend Reconciliation',
                        complexity: 'Basic',
                        businessQuestion: 'From this massive ad-network export, show me the total daily spend versus conversions for the last month.',
                        businessOutcome: 'Allows marketing teams to visualize ROAS from raw network dumps instantly without analyst support.'
                    },
                    {
                        title: 'Server Log Anomaly Detection',
                        complexity: 'Strategic',
                        businessQuestion: 'Scan this 3-million row application log. Find the exact hour where "Timeout" errors peaked.',
                        businessOutcome: 'Empowers DevOps to triage production incidents directly bypassing expensive log ingestion platforms.'
                    }
                ]
            },
            purpose: 'Demonstrate specific use-cases for massive CSV analysis',
            intentServed: 'How-to'
        },
        {
            type: 'SecurityGuardrails',
            data: {
                principles: [
                    { title: 'Zero Cloud Uploads', description: 'Because Arcli processes CSVs using client-side WebAssembly, it bypasses traditional network upload limits. You can comfortably process multi-gigabyte files locally.' },
                    { title: 'Header-Only AI Context', description: 'We only send the column headers (e.g., "Revenue", "Region") to the AI to understand your intent and author the SQL query. Your actual row data never leaves your machine.' },
                     { title: 'Technical Enabler', description: 'Embedded WebAssembly compute (DuckDB WASM).' },
                     { title: 'Technical Enabler', description: 'Automatic Schema & Data Type Inference.' }
                ]
            },
            purpose: 'Reassure users regarding large file processing and privacy',
            intentServed: 'Commercial Investigation'
        },
        {
            type: 'CTAGroup',
            data: {
                primaryLabel: 'Turn your 5GB CSV into a dashboard instantly.',
                primaryHref: '/register?intent=csv_upload',
                secondaryLabel: 'Try Arcli CSV Engine',
                secondaryHref: '/register'
            },
            purpose: 'Drive conversion for CSV upload feature',
            intentServed: 'Commercial Investigation'
        }
    ],
    faqs: [
      { q: 'Is there a file size limit for CSV ingestion?', a: 'Because Arcli processes CSVs using client-side WebAssembly, it bypasses traditional network upload limits. You can comfortably process multi-gigabyte files locally depending on your machine\'s RAM.', intent: 'Performance', schemaEnabled: true },
      { q: 'Is my uploaded CSV data sent to your AI servers?', a: 'Strictly no. We only send the column headers (e.g., "Revenue", "Region") to the AI to understand your intent and author the SQL query. Your actual row data never leaves your machine.', intent: 'Security', schemaEnabled: true }
    ],
    relatedSlugs: [
      { label: 'Analyze Sales Data', slug: '/seo/how-to-analyze-sales-data', intent: 'Supporting' },
      { label: 'Build SQL Dashboard', slug: '/seo/how-to-build-sql-dashboard', intent: 'Supporting' }
    ]
  },

  'how-to-build-sql-dashboard': {
    type: 'guide',
    title: 'How to Build an AI-Powered SQL Dashboard | Arcli',
    description: 'Learn the methodology to automate SQL reporting. Connect your database and use semantic AI to translate business questions into dynamic dashboards.',
    metaKeywords: [
      'how to build a sql dashboard', 
      'automated sql reporting', 
      'text to sql dashboard', 
      'generative BI', 
      'database visualization',
      'AI semantic layer'
    ],
    
    h1: 'How to Build an AI-Powered SQL Dashboard',
    subtitle: 'Stop writing boilerplate queries. Connect your database and use semantic AI to instantly translate business questions into optimized SQL dashboards.',
    icon: 'DatabaseZap',
    schemaMarkup: 'HowTo',
    quickAnswer: "To build a dynamic SQL dashboard without manual coding, connect your read-replica database to a Context-Aware AI routing platform like Arcli. The AI indexes your schema (without seeing your data), allowing business users to type questions in natural language. The system deterministically compiles dialect-perfect SQL, runs it against your database, and builds the visual dashboard in seconds.",

    blocks: [
        {
            type: 'ContrarianBanner',
            data: {
                statement: 'Creating a central bottleneck by requiring an analyst to write SQL for every new business question wastes 40% of Data Engineering bandwidth. Stop building rigid, static dashboards that break when a user needs to filter by a new dimension.'
            },
            purpose: 'Challenge the traditional ad-hoc reporting workflow',
            intentServed: 'Informational'
        },
        {
            type: 'InformationGain',
            data: {
                headline: 'The ROI of Automated SQL Generation',
                metrics: [
                    { label: 'Dashboard Build Time', value: 'Seconds', description: 'Reduces the time-to-insight from weeks of Jira tickets and SQL coding down to a single conversational prompt.' },
                    { label: 'Self-Serve Capability', value: 'Unblocked', description: 'Empowers non-technical operators (Marketing, Sales) to extract their own insights, decentralizing data access.' }
                ],
                workflowBefore: [
                    'Every new question requires an analyst to write a new query.',
                    'Static dashboards become obsolete quickly without manual reconfiguration.',
                    'Maintaining legacy SQL views consumes massive engineering bandwidth.'
                ],
                workflowAfter: [
                    '100% Deterministic: Semantic AI authored SQL executed by your native warehouse to prevent hallucinations.',
                    'Zero Maintenance: The platform autonomously selects the ideal chart type and builds filterable dashboards requiring zero upkeep.'
                ]
            },
            purpose: 'Quantify the value of removing the SQL bottleneck',
            intentServed: 'Commercial Investigation'
        },
        {
            type: 'ArchitectureDiagram',
            data: {
                title: 'Semantic Dashboard Assembly',
                steps: [
                    { title: '1. Semantic Mapping', description: 'Connect Arcli securely to your Postgres, Snowflake, or BigQuery read-replica. The AI achieves contextual awareness of your schema without moving raw data.' },
                    { title: '2. Define Logic', description: 'Define any strict business logic rules (e.g., "Revenue = Gross - Returns").' },
                    { title: '3. Intent Translation', description: 'Ask a question like "Show signups vs churn over the last 90 days". Dialect-perfect queries are executed securely.' },
                    { title: '4. Developer Mode', description: 'Inspect the deterministic SQL output.' },
                    { title: '5. Dynamic Assembly', description: 'Save the interactive widget to a centralized, auto-updating dashboard.' }
                ]
            },
            purpose: 'Explain the methodology of AI SQL generation',
            intentServed: 'How-to'
        },
        {
            type: 'ComparisonMatrix',
            data: {
                title: 'Dashboard Creation Workflows',
                headers: ['Feature', 'Arcli (Semantic AI)', 'Traditional BI'],
                rows: [
                    { category: 'Dashboard Creation', arcliAdvantage: 'Instant Natural Language Generation', legacy: 'Jira Tickets + Analyst SQL' },
                    { category: 'Exploration Depth', arcliAdvantage: 'Infinite conversational drill-downs', legacy: 'Pre-defined filters only' },
                    { category: 'Maintenance Cost', arcliAdvantage: 'Zero (AI adapts to schema changes)', legacy: 'High (Continuous view updates)' }
                ]
            },
            purpose: 'Contrast generative BI against legacy reporting tools',
            intentServed: 'Comparison'
        },
        {
            type: 'MetricsChart',
            data: {
                title: 'Automated Daily Health Dashboard',
                codeSnippet: {
                    language: 'sql',
                    code: "-- Automatically orchestrated across normalized tables\nSELECT \n  DATE_TRUNC('day', e.created_at) as date,\n  COUNT(DISTINCT CASE WHEN e.event_type = 'login' THEN e.user_id END) as active_users,\n  COUNT(DISTINCT CASE WHEN e.event_type = 'signup' THEN e.user_id END) as new_signups,\n  COUNT(DISTINCT CASE WHEN l.severity = 'error' THEN l.id END) as total_errors\nFROM events e \nLEFT JOIN system_logs l ON DATE_TRUNC('day', e.created_at) = DATE_TRUNC('day', l.created_at)\nWHERE e.created_at >= CURRENT_DATE - INTERVAL '14 days' \nGROUP BY 1 \nORDER BY 1 ASC;"
                },
                governedOutputs: [
                    { label: "System Errors", value: "Spike Detected", status: "trend-up" },
                    { label: "Active User Engagement", value: "Massive Drop", status: "trend-down" }
                ]
            },
            purpose: 'Prove SQL compilation capabilities across normalized tables',
            intentServed: 'Informational'
        },
        {
            type: 'AnalyticsDashboard',
            data: {
                scenarios: [
                    {
                        title: 'Cohort Retention Mapping',
                        complexity: 'Advanced',
                        businessQuestion: 'Show me a cohort retention heatmap for users who signed up in Q1, tracking their activity for 6 months.',
                        businessOutcome: 'Natively authors complex Window Functions, instantly delivering a critical growth metric.'
                    },
                    {
                        title: 'Predictive Cloud Cost Monitoring',
                        complexity: 'Strategic',
                        businessQuestion: 'Analyze our Snowflake billing table. Show compute credits used by department, and project costs for next month.',
                        businessOutcome: 'Merges live SQL querying with statistical forecasting (Linear Regression).'
                    }
                ]
            },
            purpose: 'Demonstrate advanced analytical capabilities (Window functions, prediction)',
            intentServed: 'How-to'
        },
        {
            type: 'SecurityGuardrails',
            data: {
                principles: [
                    { title: 'Semantic Governance', description: 'Arcli utilizes a Semantic Governance layer. The AI is strictly tethered to your database schema, and you can define explicit metric rules that the engine is forced to obey.' },
                    { title: 'Developer Transparency', description: 'Every chart features a "Developer Mode" allowing data analysts to inspect and manually tweak the generated query.' },
                     { title: 'Cluster Protection', description: 'We strictly mandate connecting Arcli to a Read-Replica or analytical warehouse. Our query planner enforces cost-control limits and partition-filtering to prevent accidental full-table scans.' },
                     { title: 'Push-Down Compute Architecture', description: 'Dialect-Specific SQL Compilation (Postgres, Snowflake) ensures efficient execution on your native infrastructure.' }
                ]
            },
            purpose: 'Address technical objections regarding AI generated SQL',
            intentServed: 'Commercial Investigation'
        },
        {
            type: 'CTAGroup',
            data: {
                primaryLabel: 'Automate your SQL reporting workflows today.',
                primaryHref: '/register?intent=sql_dashboard',
                secondaryLabel: 'Deploy Arcli',
                secondaryHref: '/register'
            },
            purpose: 'Drive conversion through targeted messaging',
            intentServed: 'Commercial Investigation'
        }
    ],
    faqs: [
      { q: 'How do you ensure the AI generates accurate SQL?', a: 'Arcli utilizes a Semantic Governance layer. The AI is strictly tethered to your database schema, and you can define explicit metric rules that the engine is forced to obey.', intent: 'Accuracy', schemaEnabled: true },
      { q: 'Can we view and edit the SQL generated by the AI?', a: 'Absolutely. Every chart features a "Developer Mode" allowing data analysts to inspect and manually tweak the generated query.', intent: 'Transparency', schemaEnabled: true },
      { q: 'Does building a large dashboard slow down our production database?', a: 'We strictly mandate connecting Arcli to a Read-Replica or analytical warehouse. Our query planner enforces cost-control limits and partition-filtering to prevent accidental full-table scans.', intent: 'Performance', schemaEnabled: true }
    ],
    relatedSlugs: [
      { label: 'Analyze Sales Data', slug: '/seo/how-to-analyze-sales-data', intent: 'Supporting' },
      { label: 'Build Dashboard from CSV', slug: '/seo/how-to-build-dashboard-from-csv', intent: 'Supporting' }
    ]
  }
};