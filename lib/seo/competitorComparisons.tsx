import React from 'react';
import { PieChart, Activity, Database, Target, Hexagon } from 'lucide-react';

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

export const competitorComparisons: Record<string, SEOPageData> = {
  'tableau-vs-ai-analytics': {
    type: 'comparison',
    title: 'Tableau vs AI Analytics: The Generative Shift | Arcli',
    description: 'Compare Tableau\'s desktop-first visual exploration with Arcli\'s browser-native, generative AI analytics architecture. Evaluate the modern data stack.',
    h1: 'From Visual Exploration to Generative AI',
    subtitle: 'Tableau pioneered drag-and-drop analytics. Arcli represents the next evolution: a 100% cloud-native platform driven by natural language and in-browser compute.',
    icon: <PieChart className="w-12 h-12 text-rose-500 mb-6" />,
    features: [
      'Conversational Interface (Zero VizQL)', 
      '100% Cloud-Native & Browser Based', 
      'Instant Setup via Semantic RAG',
      'In-Memory DuckDB Execution'
    ],
    theAlternative: {
      title: 'Desktop-Centric vs. Cloud-Native Agility',
      focus: [
        'Tableau relies heavily on a desktop application (Tableau Desktop) for robust dashboard authoring.',
        'Core analytical logic is built using VizQL and Level of Detail (LOD) calculations.',
        'Moving from authoring to sharing requires a distinct publishing step to Tableau Cloud or Server.',
        'Designed primarily for specialized data analysts focused on visual data exploration.'
      ],
      arcliApproach: 'Arcli collapses the authoring and consumption layers into a single, browser-native experience. By replacing proprietary calculation languages with an AI that natively understands standard SQL and your database schema, time-to-insight is dramatically compressed.'
    },
    steps: [
      { name: '1. Direct Cloud Connection', text: 'Connect data warehouses directly via read-only URLs, bypassing desktop-to-cloud extraction pipelines.' },
      { name: '2. Natural Language Querying', text: 'Type business questions in plain English; the AI handles the complex semantic mapping.' },
      { name: '3. Instantaneous Sharing', text: 'Generate secure, live-updating URL links for stakeholders with a single click.' }
    ],
    realExample: {
      query: "Show me a cohort analysis of user retention over the first 6 months.",
      sql: `-- Arcli AI writes the SQL natively, bypassing manual LOD calculations:
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
      insight: "Complex retention matrices generated instantly via natural language."
    },
    comparison: {
      competitor: 'Tableau',
      theArcliAdvantage: [
        'Zero proprietary syntax to learn; driven by conversational AI and standard SQL.', 
        'Executes heavy analytics directly in the browser via WebAssembly, requiring no desktop software.', 
        'Unified authoring and sharing environment.'
      ],
      traditionalApproach: [
        'Requires specialized training in VizQL and LOD expressions.', 
        'Heavy reliance on desktop applications for deep authoring.', 
        'Separated build-then-publish workflows.'
      ]
    },
    useCases: [
      { title: 'Data Democratization', description: 'Enable marketing and sales leaders to perform deep-dive analytics without entering a centralized analyst queue.' },
      { title: 'Agile Prototyping', description: 'Quickly validate data models and KPIs in seconds before committing them to formal enterprise dashboards.' }
    ],
    faqs: [
      { q: 'Can I migrate my core reporting metrics to Arcli?', a: 'Yes. By connecting Arcli to your existing data warehouse, our Semantic Governance layer can replicate and track your established KPIs using natural language definitions.' },
      { q: 'How does performance compare to traditional data extracts?', a: 'Arcli pushes heavy aggregation down to your database and streams the compressed results (via Parquet) to an in-browser DuckDB instance, ensuring highly responsive cross-filtering.' }
    ],
    relatedSlugs: ['powerbi-vs-ai-analytics', 'looker-vs-ai-analytics']
  },

  'powerbi-vs-ai-analytics': {
    type: 'comparison',
    title: 'Power BI vs AI Analytics: Cross-Platform Agility | Arcli',
    description: 'Evaluate Microsoft Power BI against Arcli. Understand the architectural differences between DAX-heavy ecosystems and natural-language AI.',
    h1: 'The Microsoft Ecosystem vs. Standalone Agility',
    subtitle: 'Power BI is an enterprise powerhouse deeply tied to Windows and Azure. Arcli offers a lightweight, cross-platform alternative powered by AI.',
    icon: <Activity className="w-12 h-12 text-yellow-600 mb-6" />,
    features: [
      'OS-Agnostic (Flawless on Mac & Linux)', 
      'Zero DAX Required', 
      'Automated Cross-Filtering',
      'Modern Vega-Lite Visualizations'
    ],
    theAlternative: {
      title: 'DAX Modeling vs. Semantic AI',
      focus: [
        'Power BI requires deep expertise in DAX (Data Analysis Expressions) for complex time-intelligence and relational modeling.',
        'The primary authoring environment, Power BI Desktop, is strictly available on Windows OS.',
        'Optimized for organizations heavily invested in the broader Microsoft Office 365 and Azure data ecosystem.',
        'Requires deliberate, upfront star-schema modeling for optimal performance.'
      ],
      arcliApproach: 'Arcli is built for the modern, cross-platform workforce. It runs entirely in any web browser. Instead of writing DAX to calculate rolling averages or YTD metrics, the AI compiles English requests directly into optimized SQL Window Functions.'
    },
    steps: [
      { name: '1. OS-Agnostic Access', text: 'Work seamlessly from a Mac, PC, or Linux machine without virtualization.' },
      { name: '2. Query via Chat', text: 'Bypass formula languages; ask questions and let AI construct the underlying query logic.' },
      { name: '3. Render Beautifully', text: 'Leverage auto-selected, modern Vega-Lite charts designed for high-density information display.' }
    ],
    realExample: {
      query: "Calculate the Year-over-Year (YoY) revenue growth percentage for the current month.",
      sql: `-- Arcli handles time-intelligence using standard SQL Window Functions rather than DAX:
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
      output: "KPI Scorecard with Trend Indicator",
      insight: "Time-intelligence metrics calculated instantly via standard SQL logic."
    },
    comparison: {
      competitor: 'Microsoft Power BI',
      theArcliAdvantage: [
        'No proprietary formulas (DAX) to learn; logic is driven by natural language and standard SQL.', 
        'Browser-first architecture provides full authoring capabilities to macOS users.', 
        'Automated AI chart selection reduces time spent configuring visual formats.'
      ],
      traditionalApproach: [
        'DAX requires dedicated study and specialized engineering talent.', 
        'Windows-only desktop application creates friction for mixed-OS teams.', 
        'Heavy integration reliance on the Azure/Microsoft ecosystem.'
      ]
    },
    useCases: [
      { title: 'Mac-Based Data Teams', description: 'Empower analysts and executives using macOS to build full-scale dashboards without virtual machines.' }
    ],
    faqs: [
      { q: 'Is Arcli fully functional on macOS?', a: 'Yes. Arcli is 100% cloud-native. You receive the full power of a dedicated BI suite directly in Chrome, Safari, or Firefox on any operating system.' },
      { q: 'Do I need to build a Star Schema first?', a: 'While clean data always improves performance, Arcli\'s semantic RAG engine is highly adept at navigating normalized, real-world database schemas, automatically inferring correct JOIN paths.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'metabase-vs-ai-analytics']
  },

  'metabase-vs-ai-analytics': {
    type: 'comparison',
    title: 'Metabase vs AI Analytics: Beyond the Visual Builder | Arcli',
    description: 'Transitioning from Metabase? Discover how Arcli\'s AI handles complex SQL, CTEs, and Window Functions natively, pushing beyond visual builder limits.',
    h1: 'Navigating Beyond the Visual Builder Ceiling',
    subtitle: 'Visual query builders are excellent for simple selections. See how Arcli\'s conversational AI empowers users to execute complex logic without dropping into raw SQL.',
    icon: <Database className="w-12 h-12 text-blue-500 mb-6" />,
    features: [
      'Conversational AI Interface', 
      'Generates Complex SQL Natively', 
      'Instant Schema RAG Indexing',
      'Serverless Edge Compute Architecture'
    ],
    theAlternative: {
      title: 'Visual Builders vs. Semantic Generation',
      focus: [
        'Metabase relies on a visual UI for non-technical users to filter and aggregate data.',
        'When questions require complex JOINs, subqueries, or Window Functions, users often hit a "wall" in the visual UI.',
        'Hitting the visual ceiling forces a transition to the raw SQL editor, locking out business operators.',
        'Self-hosting requires managing a Java Virtual Machine (JVM) environment.'
      ],
      arcliApproach: 'Arcli replaces the visual query builder with a highly capable Semantic Engine. By conversing with the AI, business users can trigger advanced SQL logic—like rolling averages and recursive CTEs—without ever needing to write or debug code.'
    },
    steps: [
      { name: '1. Connect the Warehouse', text: 'Link your Postgres, MySQL, or Snowflake instance securely.' },
      { name: '2. Speak in Logic', text: 'Instead of clicking through filter menus, describe your exact analytical requirements in English.' },
      { name: '3. Maintain Context', text: 'Ask follow-up questions to drill down without starting the query from scratch.' }
    ],
    realExample: {
      query: "Show me a 7-day rolling average of daily active users (DAU) for the past 30 days.",
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
      insight: "Rolling averages executed natively without dropping the user into a code editor."
    },
    comparison: {
      competitor: 'Metabase',
      theArcliAdvantage: [
        'Conversational AI handles advanced analytical logic that visual builders cannot accommodate.', 
        'Maintains conversational state for easy follow-up questions and drill-downs.', 
        'Modern WebAssembly and Serverless architecture removes JVM management overhead.'
      ],
      traditionalApproach: [
        'Visual interfaces struggle with highly complex, multi-step data transformations.', 
        'Forces business users to rely on engineers for custom SQL snippets when questions get hard.', 
        'Java-based infrastructure requires careful memory tuning.'
      ]
    },
    useCases: [
      { title: 'True Self-Serve Analytics', description: 'Eliminate the "can you write a SQL snippet for this Metabase report?" request queue for your engineering team.' }
    ],
    faqs: [
      { q: 'Can I still write my own SQL in Arcli?', a: 'Yes. While the AI is incredibly capable at generating logic, you always have full access to a specialized editor to inspect, modify, and run raw SQL directly.' },
      { q: 'Is it hard to map our schema?', a: 'Not at all. Arcli\'s semantic router maps your schema and foreign key relationships in seconds upon connection, making it ready to query instantly.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'powerbi-vs-ai-analytics']
  },

  'looker-vs-ai-analytics': {
    type: 'comparison',
    title: 'Looker vs AI Analytics: Semantic Agility | Arcli',
    description: 'Compare Looker\'s centralized LookML modeling with Arcli\'s dynamic, AI-driven semantic layer. Find the right balance of governance and speed.',
    h1: 'Enterprise Governance vs. Semantic Agility',
    subtitle: 'Looker provides strict, centralized data definitions. Arcli provides dynamic, context-aware RAG, allowing teams to explore data without months of upfront modeling.',
    icon: <Target className="w-12 h-12 text-purple-600 mb-6" />,
    features: [
      'Dynamic Semantic Routing', 
      'Zero LookML Required', 
      'Rapid Deployment Cycle',
      'Conversational Data Exploration'
    ],
    theAlternative: {
      title: 'Upfront Modeling vs. Context-Aware AI',
      focus: [
        'Looker requires defining all business logic upfront in LookML, a proprietary modeling language.',
        'Implementation cycles are lengthy, often taking months of dedicated data engineering time.',
        'Data exploration is confined to predefined "Explores"; joining non-modeled tables is heavily restricted.',
        'Built for large-scale enterprise deployments with strict, centralized data governance requirements.'
      ],
      arcliApproach: 'Arcli utilizes a dynamic, AI-driven semantic layer. While you can explicitly define core metrics in Arcli for strict governance, our Context-Aware RAG engine dynamically infers table relationships on the fly, enabling instant, ad-hoc exploration of new data.'
    },
    steps: [
      { name: '1. Dynamic Indexing', text: 'Arcli securely scans database metadata to infer relationships, bypassing massive manual setup times.' },
      { name: '2. Define Core Metrics', text: 'Lock in definitions for critical board-level KPIs (like "Active User") using simple English.' },
      { name: '3. Unrestricted Exploration', text: 'Use natural language to seamlessly query and join tables that haven\'t been formally modeled.' }
    ],
    comparison: {
      competitor: 'Google Looker',
      theArcliAdvantage: [
        'Radically faster implementation time (hours vs. months) by leveraging dynamic AI mapping.', 
        'No proprietary language (LookML) to maintain; standard SQL and English drive the platform.', 
        'Flexibility to perform ad-hoc analysis on newly ingested data immediately.'
      ],
      traditionalApproach: [
        'Requires hiring specialized LookML developers to build and maintain the semantic layer.', 
        'Lengthy, rigid deployment cycles before business users can extract value.', 
        'Exploration is heavily constrained by the boundaries of predefined models.'
      ]
    },
    useCases: [
      { title: 'Agile Mid-Market Analytics', description: 'Acquire enterprise-grade BI and governed metrics without dedicating a specialized engineering team to tool maintenance.' },
      { title: 'Rapid Prototyping', description: 'Allow analysts to freely query and join new product tables before officially merging them into the core reporting suite.' }
    ],
    faqs: [
      { q: 'Does Arcli offer any metric governance?', a: 'Yes. Our Semantic Governance layer allows you to strictly define core metrics once. The AI routes requests through these definitions to ensure consistent calculation of critical KPIs.' },
      { q: 'Does Arcli integrate with dbt?', a: 'Yes. We seamlessly read your dbt `schema.yml` files, utilizing your existing dbt descriptions and models to enhance our semantic routing AI.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'hex-vs-ai-analytics']
  },

  'hex-vs-ai-analytics': {
    type: 'comparison',
    title: 'Hex vs AI Analytics: Notebooks vs Chat | Arcli',
    description: 'Compare Hex Technologies with Arcli. Understand the difference between Python-first notebook environments and zero-code conversational BI.',
    h1: 'Data Scientists vs. Business Operators',
    subtitle: 'Hex is an exceptional platform for Python-native data scientists. Arcli is built for the business operator who needs instant answers without looking at code.',
    icon: <Hexagon className="w-12 h-12 text-purple-500 mb-6" />,
    features: [
      'Zero-Code User Experience', 
      'Conversational NLP-to-SQL', 
      'Familiar Dashboard UI',
      'Instant Metric Publishing'
    ],
    theAlternative: {
      title: 'Notebook Environments vs. Chat Interfaces',
      focus: [
        'Hex operates as a highly collaborative Python/SQL Notebook environment (similar to Jupyter).',
        'Authoring insights requires writing code in sequential cells before compiling them into an application.',
        'Targeted primarily at technical personas: Data Scientists, Analytics Engineers, and quants.',
        'Can be intimidating for non-technical stakeholders (Sales, CS, Marketing) to navigate.'
      ],
      arcliApproach: 'Arcli abstracts the computational complexity entirely. Under the hood, we run high-performance vectorized compute (Rust/Polars/DuckDB), but the user interacts via a simple chat interface. Operators ask questions and receive production-ready charts instantly.'
    },
    steps: [
      { name: '1. Chat-Driven Analysis', text: 'Interact purely using natural language; no need to write Pandas code or SQL cells.' },
      { name: '2. Orchestrated Compute', text: 'Arcli\'s engine handles complex query planning and vectorization invisibly in the background.' },
      { name: '3. Direct to Dashboard', text: 'Publish insights to live, traditional dashboard layouts instantly, skipping the notebook-to-app conversion.' }
    ],
    realExample: {
      query: "Show me the 30-day moving average of our daily active users.",
      sql: `-- Arcli generates the SQL and passes it to its internal vectorized execution engine automatically, requiring zero Python configuration.`,
      output: "Time-Series Line Chart",
      insight: "Advanced statistical smoothing executed via a conversational prompt."
    },
    comparison: {
      competitor: 'Hex Technologies',
      theArcliAdvantage: [
        'Built specifically for the accessibility of non-technical users and business operators.', 
        'No Python or SQL required to generate advanced analytical outputs.', 
        'Instantly generates traditional dashboard layouts, removing the multi-step app building process.'
      ],
      traditionalApproach: [
        'Requires data science coding skills (Python/Pandas/SQL) to author effectively.', 
        'Notebook interfaces can overwhelm stakeholders who simply want to consume a final metric.', 
        'Requires management of underlying code dependencies and cell execution order.'
      ]
    },
    useCases: [
      { title: 'Operator Empowerment', description: 'Give your Operations and Revenue teams the ability to self-serve advanced insights without needing a data scientist to write a notebook.' }
    ],
    faqs: [
      { q: 'Do you support Python execution?', a: 'Arcli\'s backend utilizes high-performance Python and Rust for vectorized compute, but the platform is strictly a zero-code environment for the user. You do not need to write Python to use Arcli.' },
      { q: 'Can I export data to a notebook later?', a: 'Absolutely. You can explore data conversationally in Arcli and export the clean, aggregated results as a Parquet or CSV file for deeper modeling in Hex, Jupyter, or any specialized data science environment.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'tableau-vs-ai-analytics']
  }
};