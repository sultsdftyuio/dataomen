// lib/seo/competitor-comparisons-1.tsx
import React from 'react';
import { PieChart, Activity, Database } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Enterprise Evaluation Matrix" schema.
 * Focuses on respectful, objective comparisons for executive buyers (CIO, CDO, VP of RevOps).
 * Replaces generic "Features/Steps" with deep ROI metrics, Synergy scenarios, 
 * and side-by-side Architectural Evaluations.
 */
export type SEOPageData = {
  type: 'comparison';
  title: string;
  description: string;
  metaKeywords: string[];
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  corePhilosophy: {
    competitorFocus: string;
    arcliEvolution: string;
    theBottomLine: string;
  };
  evaluationMatrix: {
    category: string;
    competitorApproach: string;
    arcliAdvantage: string;
    businessImpact: string;
  }[];
  synergyScenario: {
    headline: string;
    howTheyWorkTogether: string;
    workflow: string[];
  };
  roiAnalysis: {
    metric: string;
    competitorAverage: string;
    arcliAverage: string;
    financialValue: string;
  }[];
  executiveScenarios: {
    complexity: 'Basic' | 'Advanced' | 'Strategic';
    businessQuestion: string;
    competitorFriction: string;
    arcliResolution: string;
    sqlGenerated?: string;
  }[];
  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const competitorComparisonsPart1: Record<string, SEOPageData> = {
  'tableau-vs-ai-analytics': {
    type: 'comparison',
    title: 'Tableau vs AI Analytics: The Generative Shift | Arcli',
    description: 'Compare Tableau\'s desktop-first visual exploration with Arcli\'s browser-native, conversational AI architecture. Evaluate the evolution of the modern data stack.',
    metaKeywords: ['Tableau Alternative', 'Tableau vs AI', 'AI Data Analytics', 'VizQL vs SQL', 'Cloud Native BI', 'Conversational Analytics'],
    h1: 'From Visual Exploration to Generative AI',
    subtitle: 'Tableau pioneered drag-and-drop analytics. Arcli represents the next evolution: a frictionless, browser-native platform driven purely by conversational intent.',
    icon: <PieChart className="w-12 h-12 text-rose-500 mb-6" />,
    corePhilosophy: {
      competitorFocus: 'Tableau is a masterclass in visual rendering. It was built for dedicated Data Analysts who need pixel-perfect control over complex dashboards using desktop software.',
      arcliEvolution: 'Arcli is built for the Business Operator. It removes the authoring layer entirely, replacing drag-and-drop interfaces with an AI that understands plain English and writes the underlying SQL instantly.',
      theBottomLine: 'If you need pixel-perfect, static board-room presentations, use Tableau. If your team needs instant answers to ad-hoc daily questions without waiting for an analyst, use Arcli.'
    },
    evaluationMatrix: [
      {
        category: 'Authoring Interface',
        competitorApproach: 'Relies heavily on Tableau Desktop, requiring software installation and specialized training in VizQL and Level of Detail (LOD) calculations.',
        arcliAdvantage: '100% Cloud-Native. Users ask questions in a chat interface directly in their browser. No software, no proprietary formulas.',
        businessImpact: 'Zero onboarding time for non-technical executives. If they can use Slack, they can query your database.'
      },
      {
        category: 'Data Extraction',
        competitorApproach: 'Often requires building massive Data Extracts (.hyper files) that must be scheduled to refresh, leading to stale data.',
        arcliAdvantage: 'Operates as a Push-Down orchestrator. Arcli queries your live read-replica directly, returning only the aggregated results.',
        businessImpact: 'Guarantees 100% real-time data accuracy while radically reducing cloud egress fees associated with massive extracts.'
      },
      {
        category: 'Time to Insight',
        competitorApproach: 'Business user submits a Jira ticket -> Analyst builds view in Desktop -> Publishes to Cloud -> User reviews (3-5 days).',
        arcliAdvantage: 'Business user types question -> AI maps schema -> Database executes -> Chart renders (5 seconds).',
        businessImpact: 'Eliminates the centralized data engineering bottleneck, freeing expensive technical talent to focus on infrastructure.'
      }
    ],
    synergyScenario: {
      headline: 'The Perfect Complement: Tableau + Arcli',
      howTheyWorkTogether: 'You don\'t need to rip and replace Tableau. The most efficient enterprise data teams use both in a "Hub and Spoke" model.',
      workflow: [
        'Use Tableau for the "System of Record": The official weekly executive dashboard that requires rigid, pixel-perfect formatting.',
        'Use Arcli for "Ad-Hoc Exploration": The 50 random questions your sales and marketing teams ask in Slack every day.',
        'When an Arcli conversational insight proves highly valuable, the data team can formalize it into the official Tableau dashboard.'
      ]
    },
    roiAnalysis: [
      {
        metric: 'Ad-Hoc Request Turnaround',
        competitorAverage: '72 Hours',
        arcliAverage: '5 Seconds',
        financialValue: 'Accelerates deal velocity and marketing campaign optimization by removing data blackout periods.'
      },
      {
        metric: 'Engineering Hours Saved',
        competitorAverage: '0 (Status Quo)',
        arcliAverage: '15-20 Hours / Week',
        financialValue: 'Recoups roughly $80,000 annually in data engineering salaries spent pulling basic reports.'
      }
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'What were our total sales in EMEA last quarter?',
        competitorFriction: 'Requires an analyst to open Tableau Desktop, connect to the source, drag the Region dimension and Sales measure, filter by Date, and publish the view.',
        arcliResolution: 'The VP of Sales types the exact question into Arcli. The AI maps "EMEA" to the `region` column and generates the bar chart instantly.'
      },
      {
        complexity: 'Strategic',
        businessQuestion: 'Show me a cohort analysis of user retention over the first 6 months.',
        competitorFriction: 'Requires highly advanced knowledge of Tableau LOD (Level of Detail) calculations, which only senior analysts typically master.',
        arcliResolution: 'Arcli translates the conversational intent directly into a complex SQL Window Function, pushing the math to the database and rendering a Heatmap matrix instantly.',
        sqlGenerated: `WITH cohort_items AS ( SELECT user_id, DATE_TRUNC('month', MIN(created_at)) as cohort_month FROM events GROUP BY 1 ), user_activities AS ( SELECT e.user_id, EXTRACT(month FROM AGE(e.created_at, c.cohort_month)) as month_number FROM events e JOIN cohort_items c ON e.user_id = c.user_id ) SELECT cohort_month, month_number, COUNT(DISTINCT user_id) as active_users FROM cohort_items JOIN user_activities USING(user_id) GROUP BY 1, 2 ORDER BY 1, 2;`
      }
    ],
    faqs: [
      { q: 'Can I migrate my core reporting metrics to Arcli?', a: 'Yes. By connecting Arcli to your existing data warehouse, our Semantic Governance layer can replicate and track your established KPIs using natural language definitions.' },
      { q: 'How does performance compare to traditional data extracts?', a: 'Arcli pushes heavy aggregation down to your database and streams the highly compressed results (via Parquet) to an in-browser WebAssembly engine, ensuring instantaneous cross-filtering without moving raw data.' }
    ],
    relatedSlugs: ['powerbi-vs-ai-analytics', 'looker-vs-ai-analytics']
  },

  'powerbi-vs-ai-analytics': {
    type: 'comparison',
    title: 'Power BI vs AI Analytics: Cross-Platform Agility | Arcli',
    description: 'Evaluate Microsoft Power BI against Arcli. Understand the architectural differences between rigid DAX ecosystems and natural-language AI routing.',
    metaKeywords: ['Power BI Alternative', 'Power BI vs Arcli', 'DAX vs AI', 'Mac BI Tool', 'Enterprise Analytics Evaluation'],
    h1: 'The Microsoft Ecosystem vs. Frictionless Agility',
    subtitle: 'Power BI is an enterprise powerhouse deeply tied to Windows and Azure. Arcli offers a lightweight, cross-platform alternative powered by generative AI.',
    icon: <Activity className="w-12 h-12 text-yellow-600 mb-6" />,
    corePhilosophy: {
      competitorFocus: 'Power BI is arguably the most robust semantic modeling tool on the market. It thrives in organizations deeply entrenched in the Microsoft ecosystem, relying on dedicated DAX engineers to build Star Schemas.',
      arcliEvolution: 'Arcli is built for cross-platform speed. It requires zero upfront modeling, runs beautifully on macOS, and replaces the steep learning curve of DAX with plain-English conversational queries.',
      theBottomLine: 'If your entire company runs on Azure and Windows, Power BI is a natural fit. If you have a mixed-OS workforce that needs instant data access without learning DAX, Arcli is the superior choice.'
    },
    evaluationMatrix: [
      {
        category: 'Operating System',
        competitorApproach: 'Power BI Desktop (the primary authoring tool) is strictly Windows-only. Mac users are forced to use slow Virtual Machines (Parallels).',
        arcliAdvantage: '100% OS-Agnostic. The entire platform runs flawlessly in Chrome, Safari, or Firefox on Mac, Linux, or PC.',
        businessImpact: 'Instantly empowers your entire executive and creative teams (who traditionally favor Mac) with deep analytical authoring capabilities.'
      },
      {
        category: 'Analytical Language',
        competitorApproach: 'Requires mastering DAX (Data Analysis Expressions), a notoriously complex language for time-intelligence and relational filtering.',
        arcliAdvantage: 'Zero proprietary languages. You ask in English; the AI writes standard, highly optimized SQL for your specific database dialect.',
        businessImpact: 'Eliminates the "Key Person Risk" of relying on a single DAX engineer to modify business logic.'
      },
      {
        category: 'Data Modeling Dependency',
        competitorApproach: 'Performance dictates that data engineering teams must pre-model data into strict Star Schemas before analysts can build reports.',
        arcliAdvantage: 'Utilizes Dynamic Context-Aware RAG. Arcli can navigate highly normalized, raw transactional databases by inferring foreign key relationships on the fly.',
        businessImpact: 'Reduces the time-to-value of new data from weeks (building ETL pipelines) to minutes (direct querying).'
      }
    ],
    synergyScenario: {
      headline: 'Bridging the OS Gap in the Enterprise',
      howTheyWorkTogether: 'Arcli operates perfectly alongside an existing Power BI deployment by serving as the accessibility layer.',
      workflow: [
        'Data Engineering maintains the core Star Schema models in Azure/Power BI for finance and compliance.',
        'Arcli connects to those exact same data models as a read-only endpoint.',
        'Mac-using executives and marketing teams use Arcli\'s chat interface to query the Microsoft models natively, bypassing the need for Windows VMs.'
      ]
    },
    roiAnalysis: [
      {
        metric: 'Mac User Accessibility',
        competitorAverage: 'High Friction (VM required)',
        arcliAverage: 'Frictionless (Native Browser)',
        financialValue: 'Saves ~$100/user/year on Parallels licenses and reclaims hours of lost productivity due to VM latency.'
      },
      {
        metric: 'Time to Learn Authoring',
        competitorAverage: '3-6 Months (DAX mastery)',
        arcliAverage: '5 Minutes (Natural Language)',
        financialValue: 'Democratizes data access, allowing non-technical operators to pull their own insights without dedicated training.'
      }
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'Show me top 10 products by margin.',
        competitorFriction: 'A simple drag-and-drop if the model is built, but impossible for a Mac user without booting a VM.',
        arcliResolution: 'Type the question on an iPad or Macbook. The result renders in 2 seconds.'
      },
      {
        complexity: 'Strategic',
        businessQuestion: 'Calculate the Year-over-Year (YoY) revenue growth percentage for the current month.',
        competitorFriction: 'Requires writing complex DAX functions like `CALCULATE(SUM(Sales), SAMEPERIODLASTYEAR(Date))`, assuming a strict Date Table is configured.',
        arcliResolution: 'Arcli translates the intent into native SQL Window Functions (`LAG`) to calculate time-intelligence instantly against the raw tables.',
        sqlGenerated: `WITH monthly_rev AS ( SELECT DATE_TRUNC('month', created_at) as month, SUM(revenue) as total FROM sales GROUP BY 1 ) SELECT month, total, (total - LAG(total, 12) OVER (ORDER BY month)) / NULLIF(LAG(total, 12) OVER (ORDER BY month), 0) as yoy_growth FROM monthly_rev ORDER BY month DESC LIMIT 1;`
      }
    ],
    faqs: [
      { q: 'Is Arcli fully functional on macOS?', a: 'Yes. Arcli is 100% cloud-native. You receive the full power of a dedicated BI suite directly in Chrome, Safari, or Firefox on any operating system without compromise.' },
      { q: 'Do I need to build a Star Schema first?', a: 'While clean data always improves performance, Arcli\'s semantic RAG engine is highly adept at navigating normalized, real-world database schemas, automatically inferring correct JOIN paths without prior ETL.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'metabase-vs-ai-analytics']
  },

  'metabase-vs-ai-analytics': {
    type: 'comparison',
    title: 'Metabase vs AI Analytics: Beyond the Visual Builder | Arcli',
    description: 'Transitioning from Metabase? Discover how Arcli\'s AI handles complex SQL, CTEs, and Window Functions natively, pushing beyond the visual builder ceiling.',
    metaKeywords: ['Metabase Alternative', 'Metabase vs Arcli', 'Visual Query Builder', 'SQL Generator', 'Open Source BI Alternative'],
    h1: 'Navigating Beyond the Visual Builder Ceiling',
    subtitle: 'Visual query builders are excellent for simple filtering. See how Arcli\'s conversational AI empowers users to execute highly complex logic without dropping into a raw SQL editor.',
    icon: <Database className="w-12 h-12 text-blue-500 mb-6" />,
    corePhilosophy: {
      competitorFocus: 'Metabase is an incredibly popular, user-friendly tool. Its visual query builder is great for basic "filter and group" operations, but relies heavily on users dropping into a raw SQL editor for anything advanced.',
      arcliEvolution: 'Arcli eliminates the "Visual Ceiling." Instead of clicking through menus and inevitably hitting a wall, users describe their complex logic in English, and the AI authors the advanced SQL (CTEs, Window Functions) natively.',
      theBottomLine: 'Metabase is great for early-stage startups doing basic counts. Arcli is for scaling teams that need deep, complex analytical logic but don\'t want to force business operators to learn SQL.'
    },
    evaluationMatrix: [
      {
        category: 'The Complexity Ceiling',
        competitorApproach: 'The visual builder cannot handle recursive CTEs, complex JSONB unwrapping, or multi-layered window functions. It forces users into the SQL Editor.',
        arcliAdvantage: 'The AI natively writes complex PostgreSQL, Snowflake, and BigQuery dialects perfectly, meaning non-technical users can execute highly advanced math.',
        businessImpact: 'Business operators are never "locked out" of their own data by a technical wall. True self-serve analytics is achieved.'
      },
      {
        category: 'Infrastructure Overhead',
        competitorApproach: 'Self-hosting requires managing a Java Virtual Machine (JVM) environment, memory tuning, and version upgrades.',
        arcliAdvantage: 'Fully managed, Serverless Edge architecture. Zero infrastructure to deploy, maintain, or secure.',
        businessImpact: 'Reclaims DevOps and Engineering time spent managing self-hosted BI infrastructure.'
      },
      {
        category: 'Conversational State',
        competitorApproach: 'Dashboards are largely static. "Drill-downs" must be pre-configured by an analyst.',
        arcliAdvantage: 'Arcli maintains chat history. You can ask "What about just Enterprise tier?" and it modifies the previous query automatically.',
        businessImpact: 'Enables genuine data exploration and "train of thought" analysis during live executive meetings.'
      }
    ],
    synergyScenario: {
      headline: 'Graduating from Basic BI',
      howTheyWorkTogether: 'Most companies adopt Metabase early on, but hit a wall as their data models become more complex (e.g., heavily nested JSON logs).',
      workflow: [
        'Keep Metabase running for legacy embedded reports.',
        'Deploy Arcli specifically to connect to complex, unstructured read-replicas (like Postgres JSONB columns).',
        'Allow Customer Success teams to use Arcli to search unstructured application logs using natural language, bypassing the visual builder limits.'
      ]
    },
    roiAnalysis: [
      {
        metric: 'Data Request Deflection',
        competitorAverage: '40% (Simple questions only)',
        arcliAverage: '85% (Handles complex logic)',
        financialValue: 'Drastically reduces the volume of "Can you write a SQL snippet for this?" requests sent to the engineering team.'
      },
      {
        metric: 'DevOps Maintenance',
        competitorAverage: '4 Hours / Month (JVM tuning)',
        arcliAverage: '0 Hours (Managed Cloud)',
        financialValue: 'Eliminates infrastructure babysitting, ensuring maximum uptime.'
      }
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'How many users signed up yesterday?',
        competitorFriction: 'Requires 4 clicks through the visual builder (Select Table -> Filter Date -> Summarize Count).',
        arcliResolution: 'Type "Signups yesterday". Renders instantly.'
      },
      {
        complexity: 'Advanced',
        businessQuestion: 'Show me a 7-day rolling average of daily active users (DAU) for the past 30 days.',
        competitorFriction: 'The visual builder cannot calculate rolling averages across rows. The user must switch to the SQL editor and manually author a Window Function.',
        arcliResolution: 'Arcli\'s AI understands the mathematical concept of a rolling average and injects the `AVG() OVER (ROWS BETWEEN 6 PRECEDING...)` logic automatically.',
        sqlGenerated: `SELECT event_date, dau_count, AVG(dau_count) OVER (ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7_day_avg FROM ( SELECT DATE_TRUNC('day', created_at) AS event_date, COUNT(DISTINCT user_id) AS dau_count FROM user_events WHERE created_at >= CURRENT_DATE - 30 GROUP BY 1 ) ORDER BY event_date DESC;`
      }
    ],
    faqs: [
      { q: 'Can I still write my own SQL in Arcli?', a: 'Yes. While the AI is incredibly capable at generating logic, you always have full access to a specialized, color-coded editor to inspect, modify, and execute raw SQL directly.' },
      { q: 'Is it hard to map our schema?', a: 'Not at all. Arcli\'s semantic router safely indexes your schema metadata and foreign key relationships in seconds upon connection, making it ready to query instantly.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'powerbi-vs-ai-analytics']
  }
};