import React from 'react';
import { PieChart, Activity, Database, Target, Hexagon } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Search-Intent Machine" schema. Captures high-intent users
 * who are actively frustrated by the limitations, costs, and learning curves
 * of legacy Business Intelligence tools.
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

export const competitorComparisons: Record<string, SEOPageData> = {
  'tableau-vs-ai-analytics': {
    type: 'comparison',
    title: 'Tableau vs AI Analytics: The Modern Stack | Arcli',
    description: 'See why modern data teams are switching from traditional BI tools like Tableau to Arcli\'s AI-native, WebAssembly-powered analytics platform.',
    h1: 'Move Beyond Legacy BI. Switch to AI Analytics.',
    subtitle: 'Stop wrestling with calculated fields and heavy desktop clients. Discover how AI-native analytics reduces time-to-insight from weeks to seconds.',
    icon: <PieChart className="w-12 h-12 text-rose-500 mb-6" />,
    features: [
      'Conversational Interface (Zero VizQL)', 
      '100% Cloud-Native & Browser Based', 
      'Instant Setup via Semantic RAG',
      'In-Memory DuckDB Execution'
    ],
    painPoints: {
      title: 'Why Tableau is Slowing Your Team Down',
      points: [
        'Requires expensive, heavy desktop licenses (Tableau Desktop) just to build a basic dashboard.',
        'Learning to write VizQL and complex Level of Detail (LOD) expressions takes months of training.',
        'Publishing from Desktop to Cloud is a clunky, slow workflow that creates version control nightmares.',
        'Dashboards are highly rigid; business users cannot ask ad-hoc questions outside the predefined filters.'
      ],
      solution: 'Arcli replaces the entire Tableau build-publish-consume pipeline. You connect your database via a web browser. Our AI understands the schema natively. You type what you want to see in plain English, and we generate the interactive charts instantly.'
    },
    steps: [
      { name: '1. Connect Data', text: 'Skip the heavy data engineering extract pipeline. Connect databases directly via read-only URLs.' },
      { name: '2. Ask Questions', text: 'Instead of dragging and dropping dimensions into rows and columns, just type what you want to know.' },
      { name: '3. Share Insights', text: 'Send interactive, self-updating charts via secure URLs instantly, without worrying about "Viewer" licenses.' }
    ],
    realExample: {
      query: "Show me a cohort analysis of user retention over the first 6 months. (In Tableau, this requires 5 calculated fields and complex LODs).",
      sql: `-- Arcli AI writes the SQL instantly, bypassing manual LOD calculations:
WITH cohort_items AS (
  SELECT user_id, DATE_TRUNC('month', MIN(created_at)) as cohort_month
  FROM events GROUP BY 1
),
user_activities AS (
  SELECT e.user_id, EXTRACT(month FROM AGE(e.created_at, c.cohort_month)) as month_number
  FROM events e JOIN cohort_items c ON e.user_id = c.user_id
)
SELECT cohort_month, month_number, COUNT(DISTINCT user_id) as active_users
FROM cohort_items JOIN user_activities USING(user_id)
GROUP BY 1, 2 ORDER BY 1, 2;`,
      output: "Interactive Heatmap Matrix",
      insight: "Generated instantly via natural language, bypassing hours of manual Tableau configuration."
    },
    comparison: {
      competitor: 'Tableau',
      arcliWins: [
        'Conversational AI Interface (NL2SQL) requires zero training.', 
        'Executes heavy analytics directly in the browser via WebAssembly.', 
        'No expensive desktop licenses required to be a "Creator".'
      ],
      competitorFlaws: [
        'Requires deeply specialized knowledge of VizQL and LOD expressions.', 
        'Extremely expensive for full-org deployment.', 
        'Slow, disjointed desktop-to-cloud publishing workflows.'
      ]
    },
    useCases: [
      { title: 'Democratizing Data', description: 'Allow marketing and sales teams to pull their own complex reports without waiting weeks in the data analyst queue.' },
      { title: 'Embedded Analytics', description: 'Easily embed Arcli\'s modern React-Vega charts into your own SaaS application without paying exorbitant Tableau Server fees.' }
    ],
    faqs: [
      { q: 'Can I migrate my existing Tableau dashboards to Arcli?', a: 'Yes. By connecting Arcli to the same underlying data warehouse (e.g., Snowflake or Postgres), our AI can recreate your core dashboard metrics in minutes simply by asking it to track those specific KPIs.' },
      { q: 'How does performance compare to Tableau Data Extracts (.hyper)?', a: 'Arcli utilizes a highly optimized hybrid engine. We push heavy aggregation down to your database, and stream the compressed results (Parquet) to an in-browser DuckDB instance, resulting in lightning-fast, zero-latency cross-filtering.' }
    ],
    relatedSlugs: ['powerbi-vs-ai-analytics', 'looker-vs-ai-analytics']
  },

  'powerbi-vs-ai-analytics': {
    type: 'comparison',
    title: 'Power BI vs AI Analytics | Arcli',
    description: 'Compare Microsoft Power BI with modern AI analytics. Learn why startups and modern enterprises are ditching DAX and Windows for Arcli.',
    h1: 'Ditch DAX. Embrace AI Analytics.',
    subtitle: 'Power BI is ubiquitous, but it forces your team to learn complex DAX formulas and use Windows machines. Arcli replaces formulas with plain English.',
    icon: <Activity className="w-12 h-12 text-yellow-600 mb-6" />,
    features: [
      '100% Cloud-Native (Mac & PC)', 
      'Zero DAX Required (Plain English)', 
      'Automated Cross-Filtering',
      'Modern Vega-Lite Visualizations'
    ],
    painPoints: {
      title: 'The Hidden Costs of Power BI',
      points: [
        'DAX (Data Analysis Expressions) has an infamously brutal learning curve for basic time-intelligence metrics.',
        'Power BI Desktop is strictly Windows-only, alienating data teams and executives who use Macs.',
        'The Power Query Editor is incredibly clunky and difficult to debug when data sources change.',
        'Visuals look dated and heavily corporate out-of-the-box.'
      ],
      solution: 'Arcli is built for the modern, cross-platform workforce. It runs entirely in your browser. Instead of writing DAX to calculate a 3-month rolling average, you simply ask the AI. We compile it to standard SQL and visualize it with beautiful, modern charts.'
    },
    steps: [
      { name: '1. Connect Anywhere', text: 'Link your cloud data warehouses seamlessly via the web.' },
      { name: '2. Query in English', text: 'Ask questions without writing a single DAX formula or building a star-schema model manually.' },
      { name: '3. Publish Instantly', text: 'Share live, interactive dashboards instantly across your organization with a single click.' }
    ],
    realExample: {
      query: "Calculate the Year-over-Year (YoY) revenue growth percentage for the current month. (A notoriously complex DAX pattern).",
      sql: `-- Arcli handles time-intelligence using standard SQL Window Functions:
WITH monthly_revenue AS (
  SELECT DATE_TRUNC('month', date) as month, SUM(revenue) as total
  FROM sales GROUP BY 1
)
SELECT 
  month, 
  total,
  LAG(total, 12) OVER (ORDER BY month) as last_year_total,
  (total - LAG(total, 12) OVER (ORDER BY month)) / NULLIF(LAG(total, 12) OVER (ORDER BY month), 0) as yoy_growth
FROM monthly_revenue
ORDER BY month DESC LIMIT 1;`,
      output: "KPI Scorecard with Green Trend Indicator",
      insight: "YoY Revenue Growth calculated in 1.2 seconds. No DAX time-intelligence tables required."
    },
    comparison: {
      competitor: 'Microsoft Power BI',
      arcliWins: [
        'No proprietary formulas (DAX) to learn; driven by AI and SQL.', 
        'Browser-first architecture works flawlessly on Mac, Windows, and Linux.', 
        'Automated AI chart selection prevents misleading data visualizations.'
      ],
      competitorFlaws: [
        'DAX is unintuitive and requires specialized engineering talent.', 
        'The desktop application is completely unavailable for macOS users.', 
        'Clunky, multi-step cloud publishing and workspace management.'
      ]
    },
    useCases: [
      { title: 'Agile Executive Reporting', description: 'Pivot reporting metrics instantly during executive meetings using chat, rather than telling the board "I\'ll have to rebuild the Power BI model and get back to you."' }
    ],
    faqs: [
      { q: 'Is Arcli Mac compatible?', a: 'Yes! Arcli is 100% cloud-native. You get the full power of a dedicated BI suite directly in Chrome, Safari, or Firefox on any operating system.' },
      { q: 'Do I need to build a Star Schema first?', a: 'While clean data always helps, Arcli\'s semantic RAG engine is highly adept at navigating normalized, real-world database schemas, automatically inferring the correct JOIN paths without a strict Star Schema requirement.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'metabase-vs-ai-analytics']
  },

  'metabase-vs-ai-analytics': {
    type: 'comparison',
    title: 'Metabase vs AI Analytics | Arcli',
    description: 'Compare Metabase with modern AI analytics platforms. See why fast-growing startups are switching from visual query builders to conversational BI.',
    h1: 'Metabase vs. Modern AI Analytics',
    subtitle: 'Metabase is a great V1 BI tool, but its visual builder breaks down on complex queries. See how Arcli replaces manual querying with semantic AI.',
    icon: <Database className="w-12 h-12 text-blue-500 mb-6" />,
    features: [
      'Conversational AI Interface', 
      'Generates Complex SQL Natively', 
      'Instant Schema RAG Indexing',
      'Zero JVM Overhead'
    ],
    painPoints: {
      title: 'The "Visual Builder" Wall',
      points: [
        'Metabase\'s visual query builder is great for simple "SELECT *", but completely falls apart when you need complex JOINs, CTEs, or Window Functions.',
        'Once you hit the limit of the visual builder, you are forced to write raw SQL, locking out business users.',
        'Self-hosting Metabase requires managing a heavy Java Virtual Machine (JVM) that frequently suffers from memory leaks and out-of-memory crashes on large queries.'
      ],
      solution: 'Arcli acts as an expert SQL analyst. Instead of clicking through a limited visual interface, you tell Arcli what you want. It writes the complex CTEs and Window Functions natively, executing them securely against your database.'
    },
    steps: [
      { name: '1. Connect DB', text: 'Link your Postgres, MySQL, or Snowflake database just like Metabase.' },
      { name: '2. Skip the Builder', text: 'Instead of fighting a visual query interface, just type your question in English.' },
      { name: '3. Auto-Dashboard', text: 'Pin your AI-generated interactive charts directly to a live, tenant-isolated dashboard.' }
    ],
    realExample: {
      query: "Show me a 7-day rolling average of daily active users (DAU) for the past 30 days. (In Metabase, this forces you into the raw SQL editor).",
      sql: `SELECT 
  event_date,
  dau_count,
  AVG(dau_count) OVER (ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7_day_avg
FROM (
  SELECT DATE_TRUNC('day', created_at) AS event_date, COUNT(DISTINCT user_id) AS dau_count
  FROM user_events
  WHERE created_at >= CURRENT_DATE - 30
  GROUP BY 1
)
ORDER BY event_date DESC;`,
      output: "Dual-Axis Line & Bar Chart",
      insight: "Rolling averages handled flawlessly by AI-generated Window Functions, fully accessible to non-engineers."
    },
    comparison: {
      competitor: 'Metabase',
      arcliWins: [
        'Conversational AI handles logic that visual builders cannot process.', 
        'No Java (JVM) required; entirely built on modern WebAssembly and Serverless edge compute.', 
        'Maintains conversational state for easy follow-up questions ("Now filter that by Enterprise tier").'
      ],
      competitorFlaws: [
        'Visual builder breaks quickly on real-world analytical questions.', 
        'Forces business users to constantly ask engineers for custom SQL snippets.', 
        'Notoriously heavy memory footprint for self-hosted instances.'
      ]
    },
    useCases: [
      { title: 'Scaling Data Access', description: 'Move from a centralized data request queue (where engineers write Metabase SQL) to true self-serve analytics for the whole company.' }
    ],
    faqs: [
      { q: 'Is Arcli harder to set up than Metabase?', a: 'No. Both require a simple read-only database connection string. Arcli\'s semantic router maps your schema in seconds, making it ready to query instantly.' },
      { q: 'Can I write my own SQL in Arcli?', a: 'Yes. While the AI is incredibly capable, you always have full access to inspect, modify, and run raw SQL directly in the platform.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'powerbi-vs-ai-analytics']
  },

  'looker-vs-ai-analytics': {
    type: 'comparison',
    title: 'Looker vs AI Analytics | Arcli',
    description: 'Compare Google Looker with Arcli. See why agile data teams are moving away from monolithic LookML deployments to nimble, semantic AI platforms.',
    h1: 'The Modern Alternative to Looker',
    subtitle: 'Looker is incredibly powerful, but maintaining LookML requires an expensive, dedicated team of engineers. Discover the high-velocity AI alternative.',
    icon: <Target className="w-12 h-12 text-purple-600 mb-6" />,
    features: [
      'Zero LookML Required', 
      'RAG-Based Semantic Routing', 
      'Instant Deployment (Days, not Months)',
      'Conversational Explore Interface'
    ],
    painPoints: {
      title: 'The LookML Bottleneck',
      points: [
        'Implementing Looker successfully takes 3 to 6 months of dedicated data engineering time to build the LookML semantic layer.',
        'Looker "Explores" are highly rigid. If a business user wants to join a table not explicitly defined in the LookML model, they cannot do it.',
        'Enterprise pricing for Looker is prohibitively expensive for startups and mid-market companies.'
      ],
      solution: 'Arcli utilizes a dynamic, AI-driven semantic layer. You can define your core metrics easily, but for exploratory analysis, our AI acts as a dynamic LookML engine, writing the optimal JOIN paths on the fly based on your schema metadata.'
    },
    steps: [
      { name: '1. Skip the Modeling', text: 'Arcli infers semantic relationships automatically via Vector RAG, bypassing massive setup times.' },
      { name: '2. Ask Questions', text: 'Use natural language to explore data instead of navigating rigid Looker drop-down menus.' },
      { name: '3. Deploy Faster', text: 'Get your entire organization operational on data in minutes, not months.' }
    ],
    comparison: {
      competitor: 'Google Looker',
      arcliWins: [
        'No proprietary language (LookML) to learn or maintain.', 
        'Radically faster implementation time (hours vs. months).', 
        'Conversational interface is vastly more intuitive for non-technical operators.'
      ],
      competitorFlaws: [
        'Requires hiring specialized LookML developers.', 
        'Looker\'s UI feels dated and highly complex for average business users.', 
        'Inflexible rigid data models prevent rapid ad-hoc exploration.'
      ]
    },
    useCases: [
      { title: 'Agile Startups & Mid-Market', description: 'Get enterprise-grade BI and governed metrics without hiring a 3-person data team just to manage the tool.' },
      { title: 'Ad-Hoc Exploratory Analysis', description: 'Allow analysts to freely query and join tables that haven\'t been officially modeled into the core semantic layer yet.' }
    ],
    faqs: [
      { q: 'Can Arcli handle complex, governed metric definitions like Looker does?', a: 'Yes. Our Semantic Governance layer allows you to strictly define core metrics (like "Recognized Revenue" or "Active User") once. The AI routes requests through these definitions so it never miscalculates board-level KPIs.' },
      { q: 'Does Arcli integrate with dbt?', a: 'Yes. We seamlessly read your dbt `schema.yml` files, utilizing your existing dbt descriptions and models to inform our semantic routing AI.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'hex-vs-ai-analytics']
  },

  'hex-vs-ai-analytics': {
    type: 'comparison',
    title: 'Hex vs AI Analytics | Arcli',
    description: 'Compare Hex Technologies with Arcli. Find the right platform for your data science and business intelligence needs.',
    h1: 'The Alternative to Hex for Business Teams',
    subtitle: 'Hex is an amazing tool built for Python-heavy data scientists. Arcli is built for the rest of the company—operators who want instant answers without seeing code.',
    icon: <Hexagon className="w-12 h-12 text-purple-500 mb-6" />,
    features: [
      'Zero-Code Required', 
      'Instant NLP-to-SQL Queries', 
      'Business-Friendly Dashboard UI',
      'No Notebook Environments'
    ],
    painPoints: {
      title: 'Why Notebooks Alienate Business Users',
      points: [
        'Hex is fundamentally a Python Notebook environment (Jupyter-style), which is deeply intimidating to Sales, Marketing, and Operations teams.',
        'Building a dashboard in Hex still requires writing SQL or Python/Pandas logic in cells before publishing.',
        'View-only licenses for business stakeholders who just want to check a metric can become very expensive.'
      ],
      solution: 'Arcli abstracts the code away entirely. While we run high-performance compute under the hood, the user interface is a simple, familiar chat window. Operators ask questions, and Arcli returns beautiful, production-ready charts instantly.'
    },
    steps: [
      { name: '1. Bypass Python', text: 'No need to write Pandas code or SQL cells. Interact purely using natural language.' },
      { name: '2. AI Generates Logic', text: 'Our orchestration engine handles the complex vectorization and query planning in the background.' },
      { name: '3. Deploy Fast', text: 'Publish insights to your team via live dashboards without managing heavy notebook states.' }
    ],
    realExample: {
      query: "Predict our Q4 revenue based on the historical exponential moving average of the last 24 months.",
      sql: `-- Instead of writing Python/Statsmodels in a Hex cell, Arcli generates the SQL and passes it to its internal vectorized execution engine automatically.`,
      output: "Time-Series Line Chart with Dotted Forecast Projection",
      insight: "Complex forecasting executed via a single conversational prompt, no Python required."
    },
    comparison: {
      competitor: 'Hex Technologies',
      arcliWins: [
        'Built specifically for non-technical users and business operators.', 
        'No Python or SQL required to generate advanced analytics.', 
        'Instantly generates traditional dashboard layouts, skipping the "notebook-to-app" step.'
      ],
      competitorFlaws: [
        'Steep learning curve; requires data science (Python/SQL) skills to author.', 
        'Notebook interfaces overwhelm business users who just want to see a chart.', 
        'Complex environment management for dependencies.'
      ]
    },
    useCases: [
      { title: 'Operator Empowerment', description: 'Give your non-technical teams (Marketing, Sales, CS) the analytical power of a data scientist without forcing them to learn Python.' }
    ],
    faqs: [
      { q: 'Do you support Python execution?', a: 'Arcli\'s backend is powered by high-performance Python and Rust (Polars/DuckDB) for vectorized compute, but the user experience is strictly 100% zero-code. You do not need to write Python to use Arcli.' },
      { q: 'Can I export the data if I want to use it in a notebook later?', a: 'Absolutely. You can explore the data conversationally in Arcli, and export the clean, aggregated results as a CSV or Parquet file to use in Hex, Jupyter, or any other data science environment.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'tableau-vs-ai-analytics']
  }
};