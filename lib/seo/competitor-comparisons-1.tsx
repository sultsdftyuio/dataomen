// lib/seo/competitor-comparisons-1.tsx
import React from 'react';
import { PieChart, Activity, Database, Layers, Cloud } from 'lucide-react';

/**
 * SEOPageData Interface
 * "Enterprise Evaluation Matrix" schema.
 * Written for executive buyers (CIO, CDO, VP of RevOps).
 * Focus: ROI, Synergy, and side-by-side architectural trade-offs.
 * Tone: respectful, outcome-focused, never absolute.
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
    highlight?: 'speed' | 'cost' | 'security';
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
    description:
      "Compare Tableau's desktop-first visual exploration with Arcli's browser-native, conversational AI architecture. Evaluate the evolution of the modern data stack.",
    metaKeywords: [
      'Tableau Alternative',
      'Tableau vs AI',
      'AI Data Analytics',
      'VizQL vs SQL',
      'Cloud Native BI',
      'Conversational Analytics',
    ],
    h1: 'From Visual Exploration to Conversational AI',
    subtitle:
      'Tableau pioneered drag-and-drop analytics. Arcli represents the next evolution: a frictionless, browser-native platform where business operators ask questions in plain English and get answers in seconds.',
    icon: <PieChart className="w-12 h-12 text-rose-500 mb-6" />,
    corePhilosophy: {
      competitorFocus:
        'Tableau is a masterclass in visual rendering. It was built for dedicated Data Analysts who need fine-grained control over complex dashboards, typically using desktop software and proprietary formula languages.',
      arcliEvolution:
        'Arcli is built for the Business Operator. It removes the authoring layer entirely, replacing drag-and-drop menus with an AI that understands plain English and writes the underlying query logic on the fly — using a read-only connection directly to your database.',
      theBottomLine:
        'If your team needs pixel-perfect, branded board-room presentations with locked-down formatting, Tableau excels. If your team needs instant answers to ad-hoc daily questions without waiting in an analyst queue, Arcli is a strong fit.',
    },
    evaluationMatrix: [
      {
        category: 'Authoring Interface',
        competitorApproach:
          'Relies heavily on Tableau Desktop, requiring software installation and specialized training in its proprietary formula language.',
        arcliAdvantage:
          'Entirely cloud-native. Users ask questions in a chat interface directly in their browser — no software to install, no proprietary formulas to learn.',
        businessImpact:
          'Near-zero onboarding time for non-technical executives. If your team can use Slack, they can query your database.',
        highlight: 'speed',
      },
      {
        category: 'Data Freshness',
        competitorApproach:
          'Often relies on scheduled data extracts that must be rebuilt on a timer, meaning dashboards can reflect data that is hours or days old.',
        arcliAdvantage:
          'Queries your live read-replica directly, returning only the small, aggregated results — your raw data never moves.',
        businessImpact:
          'Designed to reflect real-time data accuracy while reducing the cloud costs associated with moving large extract files.',
        highlight: 'security',
      },
      {
        category: 'Time to Insight',
        competitorApproach:
          'Business user submits a request → Analyst builds view in Desktop → Publishes to Cloud → User reviews. Typically 3–5 business days.',
        arcliAdvantage:
          'Business user types a question → AI maps schema → Database executes → Chart renders. Typically under 10 seconds.',
        businessImpact:
          'Helps reduce the centralized data engineering bottleneck, freeing technical talent to focus on higher-value infrastructure work.',
        highlight: 'speed',
      },
    ],
    synergyScenario: {
      headline: 'The Perfect Complement: Tableau + Arcli',
      howTheyWorkTogether:
        'There\'s no need to rip and replace Tableau. The most efficient enterprise data teams use both in a "Hub and Spoke" model.',
      workflow: [
        'Use Tableau as the "System of Record": The official weekly executive dashboard that requires rigid, pixel-perfect formatting and formal sign-off.',
        'Use Arcli for "Ad-Hoc Exploration": The dozens of random questions your sales and marketing teams ask every day.',
        'When an Arcli conversational insight proves highly valuable, the data team can formalize it into the official Tableau dashboard for the next board cycle.',
      ],
    },
    roiAnalysis: [
      {
        metric: 'Ad-Hoc Request Turnaround',
        competitorAverage: '72 Hours (typical)',
        arcliAverage: 'Under 10 Seconds',
        financialValue:
          'Faster answers accelerate deal cycles and marketing decisions — removing data blackout periods that cost teams momentum.',
      },
      {
        metric: 'Engineering Hours Recovered',
        competitorAverage: '0 (status quo)',
        arcliAverage: '15–20 Hours / Week',
        financialValue:
          'Equivalent to recovering 0.5–1 full-time analyst workload per quarter — hours previously spent pulling basic reports on request.',
      },
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'What were our total sales in EMEA last quarter?',
        competitorFriction:
          'Requires an analyst to open Tableau Desktop, connect to the source, configure dimensions and measures, apply date and region filters, and publish.',
        arcliResolution:
          'The VP of Sales types the exact question into Arcli. The AI maps the intent to your schema and renders the chart in seconds.',
      },
      {
        complexity: 'Advanced',
        businessQuestion:
          'Compare our marketing spend versus new customer acquisitions for the last 6 months.',
        competitorFriction:
          'Requires blending two separate data sources (marketing and sales databases), which can introduce duplication errors if the relationship cardinality is not handled carefully.',
        arcliResolution:
          'Arcli identifies the shared date and campaign keys across both schemas and generates the correct join logic automatically, without duplicating rows.',
      },
      {
        complexity: 'Strategic',
        businessQuestion:
          'Show me a cohort analysis of user retention over the first 6 months.',
        competitorFriction:
          'Requires highly advanced knowledge of Tableau LOD (Level of Detail) calculations — a skill typically limited to senior analysts.',
        arcliResolution:
          'Arcli translates the plain-English intent into a SQL Window Function, pushing the computation to your database and rendering a retention heatmap matrix.',
        sqlGenerated: `WITH cohort_items AS (
  SELECT user_id, DATE_TRUNC('month', MIN(created_at)) AS cohort_month
  FROM events
  GROUP BY 1
),
user_activities AS (
  SELECT e.user_id,
    EXTRACT(month FROM AGE(e.created_at, c.cohort_month)) AS month_number
  FROM events e
  JOIN cohort_items c ON e.user_id = c.user_id
)
SELECT cohort_month, month_number, COUNT(DISTINCT user_id) AS active_users
FROM cohort_items
JOIN user_activities USING (user_id)
GROUP BY 1, 2
ORDER BY 1, 2;`,
      },
    ],
    faqs: [
      {
        q: 'Can I migrate my core reporting metrics to Arcli?',
        a: 'Yes. By connecting Arcli to your existing data warehouse via a read-only role, you can define and track your established KPIs using natural language — no proprietary formula language required.',
      },
      {
        q: 'How does performance compare to traditional data extracts?',
        a: 'Arcli pushes aggregation down to your database and streams only the small, summarized results back to the browser for rendering — no raw data movement involved.',
      },
      {
        q: 'Does Arcli require specialized training for non-technical users?',
        a: 'No. Arcli uses conversational English as its primary interface. If a user can describe their business question, the AI handles the underlying technical logic.',
      },
      {
        q: 'How does Arcli handle data security?',
        a: 'Arcli connects exclusively via a read-only database role. Your raw data is never stored in our systems, which simplifies compliance with strict data residency requirements.',
      },
      {
        q: 'Can Arcli replace our entire Tableau deployment?',
        a: 'For highly operational teams focused on ad-hoc queries and daily decisions, many companies find it can. For organizations requiring pixel-perfect, heavily branded PDF board reports, we recommend using Arcli alongside Tableau as complementary tools.',
      },
      {
        q: 'How do you prevent the AI from returning incorrect data?',
        a: 'Arcli uses your literal database schema as the source of truth. The AI maps natural language to your actual column names and writes deterministic SQL that can always be inspected and audited.',
      },
    ],
    relatedSlugs: [
      'powerbi-vs-ai-analytics',
      'looker-vs-ai-analytics',
      'natural-language-to-sql',
    ],
  },

  'powerbi-vs-ai-analytics': {
    type: 'comparison',
    title: 'Power BI vs AI Analytics: Cross-Platform Agility | Arcli',
    description:
      'Evaluate Microsoft Power BI against Arcli. Understand the architectural differences between rigid DAX ecosystems and natural-language AI routing.',
    metaKeywords: [
      'Power BI Alternative',
      'Power BI vs Arcli',
      'DAX vs AI',
      'Mac BI Tool',
      'Enterprise Analytics Evaluation',
    ],
    h1: 'The Microsoft Ecosystem vs. Cross-Platform Agility',
    subtitle:
      'Power BI is an enterprise powerhouse deeply tied to Windows and Azure. Arcli offers a lightweight, cross-platform alternative that works in any browser on any operating system.',
    icon: <Activity className="w-12 h-12 text-yellow-600 mb-6" />,
    corePhilosophy: {
      competitorFocus:
        'Power BI is one of the most robust semantic modeling tools on the market. It thrives in organizations deeply embedded in the Microsoft ecosystem, relying on dedicated DAX engineers to build and maintain data models.',
      arcliEvolution:
        'Arcli is built for cross-platform speed. It requires no upfront modeling, works equally well on macOS, Windows, or Linux, and replaces the steep learning curve of DAX with plain-English conversational queries over a secure, read-only connection.',
      theBottomLine:
        'If your entire company runs on Azure and Windows and has dedicated DAX engineers, Power BI is a natural fit. If you have a mixed-OS workforce that needs fast data access without a proprietary modeling language, Arcli is worth evaluating.',
    },
    evaluationMatrix: [
      {
        category: 'Operating System',
        competitorApproach:
          'Power BI Desktop — the primary authoring tool — is Windows-only. Mac users are typically forced to use Virtual Machines, adding friction and latency.',
        arcliAdvantage:
          'Fully OS-agnostic. The entire platform runs in Chrome, Safari, or Firefox on Mac, Linux, or PC with no software to install.',
        businessImpact:
          'Empowers your entire executive and creative teams — who often favor Mac — without requiring workarounds or additional software licenses.',
        highlight: 'speed',
      },
      {
        category: 'Analytical Language',
        competitorApproach:
          'Requires mastering DAX (Data Analysis Expressions), a complex proprietary language for time-intelligence and relational filtering that takes months to learn.',
        arcliAdvantage:
          'No proprietary languages. You ask in plain English; the AI writes standard SQL optimized for your specific database dialect — via a read-only connection.',
        businessImpact:
          'Reduces the risk of over-reliance on a single specialist to modify business logic.',
        highlight: 'speed',
      },
      {
        category: 'Data Modeling Dependency',
        competitorApproach:
          'Performance typically requires data engineering teams to pre-model data into strict Star Schemas before analysts can build reports.',
        arcliAdvantage:
          "Arcli's AI understands how your tables are connected by analyzing your schema at query time, allowing it to navigate normalized, raw databases without prior modeling.",
        businessImpact:
          'Reduces the time between new data arriving and your team being able to query it — from weeks to minutes in many cases.',
        highlight: 'cost',
      },
    ],
    synergyScenario: {
      headline: 'Bridging the OS Gap in the Enterprise',
      howTheyWorkTogether:
        'Arcli pairs well with an existing Power BI deployment by serving as the accessibility layer for teams that Power BI Desktop cannot easily reach.',
      workflow: [
        'Data Engineering maintains the core data models in Azure / Power BI for finance and compliance reporting.',
        'Arcli connects to those same data sources as a read-only endpoint.',
        "Mac-using executives and marketing teams use Arcli's chat interface to query the same data natively — no Windows VMs required.",
      ],
    },
    roiAnalysis: [
      {
        metric: 'Mac User Accessibility',
        competitorAverage: 'High friction (VM required)',
        arcliAverage: 'Native browser experience',
        financialValue:
          'Eliminates per-user VM licensing costs and recovers hours of productivity lost to VM startup times and latency.',
      },
      {
        metric: 'Time to Learn Authoring',
        competitorAverage: '3–6 months (DAX mastery)',
        arcliAverage: 'Under an hour (natural language)',
        financialValue:
          'Allows non-technical operators to pull their own insights on day one — no dedicated training program required.',
      },
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'Show me top 10 products by margin.',
        competitorFriction:
          'Straightforward on Windows if the model is already built, but requires a VM or workaround for Mac users.',
        arcliResolution:
          'Type the question in any browser on any device. The result renders in seconds.',
      },
      {
        complexity: 'Advanced',
        businessQuestion:
          'Identify regions where our operational costs have outpaced sales over the last three quarters.',
        competitorFriction:
          'Typically requires iterative DAX calculations across multiple unrelated fact tables, which can introduce context transition errors that are difficult to debug.',
        arcliResolution:
          'Arcli understands the temporal comparison and generates a cross-join query that normalizes the data across the time range, delivering a visual result immediately.',
      },
      {
        complexity: 'Strategic',
        businessQuestion:
          'Calculate Year-over-Year (YoY) revenue growth percentage for the current month.',
        competitorFriction:
          'Requires writing DAX time-intelligence functions and assumes a strictly configured Date Table — a setup dependency that can block non-engineers.',
        arcliResolution:
          'Arcli translates the intent into a standard SQL Window Function, calculating the comparison directly against your raw tables with no pre-configuration needed.',
        sqlGenerated: `WITH monthly_rev AS (
  SELECT DATE_TRUNC('month', created_at) AS month, SUM(revenue) AS total
  FROM sales
  GROUP BY 1
)
SELECT
  month,
  total,
  (total - LAG(total, 12) OVER (ORDER BY month))
    / NULLIF(LAG(total, 12) OVER (ORDER BY month), 0) AS yoy_growth
FROM monthly_rev
ORDER BY month DESC
LIMIT 1;`,
      },
    ],
    faqs: [
      {
        q: 'Is Arcli fully functional on macOS?',
        a: 'Yes. Arcli is entirely cloud-native. You get the full analytical experience in Chrome, Safari, or Firefox on any operating system — no compromises.',
      },
      {
        q: 'Do I need to build a Star Schema first?',
        a: "While clean, well-structured data always helps, Arcli's AI is capable of navigating normalized, real-world database schemas and inferring join paths without prior ETL.",
      },
      {
        q: 'Does Arcli integrate with Microsoft SQL Server or Azure Synapse?',
        a: 'Yes. Arcli connects to MS SQL, Azure Postgres, and Synapse via read-only credentials, leveraging your existing Microsoft infrastructure for compute.',
      },
      {
        q: 'How does Arcli handle row-level security (RLS)?',
        a: 'Arcli inherits the permissions of the read-only database user it connects with. If your database enforces RLS policies for that user, Arcli abides by them automatically.',
      },
      {
        q: 'Is there a steep learning curve for teams used to Excel and Power BI?',
        a: 'Typically the opposite. Because Arcli uses natural language, the learning curve is minimal. If your team can type a question, they can pull a report.',
      },
      {
        q: 'How do you handle complex DAX logic we have already built?',
        a: "Arcli generates SQL rather than DAX. However, you can define complex business logic in plain English once inside Arcli's Semantic Metrics, and the AI will apply that definition consistently across all future queries.",
      },
    ],
    relatedSlugs: [
      'tableau-vs-ai-analytics',
      'metabase-vs-ai-analytics',
      'looker-vs-ai-analytics',
    ],
  },

  'metabase-vs-ai-analytics': {
    type: 'comparison',
    title: 'Metabase vs AI Analytics: Beyond the Visual Builder | Arcli',
    description:
      "Transitioning from Metabase? Discover how Arcli's AI handles complex SQL, CTEs, and Window Functions natively, pushing beyond the visual builder ceiling.",
    metaKeywords: [
      'Metabase Alternative',
      'Metabase vs Arcli',
      'Visual Query Builder',
      'SQL Generator',
      'Open Source BI Alternative',
    ],
    h1: 'Navigating Beyond the Visual Builder Ceiling',
    subtitle:
      "Visual query builders are excellent for simple filtering. See how Arcli's conversational AI empowers users to execute highly complex logic without dropping into a raw SQL editor.",
    icon: <Database className="w-12 h-12 text-blue-500 mb-6" />,
    corePhilosophy: {
      competitorFocus:
        'Metabase is an incredibly popular, user-friendly tool. Its visual query builder works well for basic filter-and-group operations, but users often need to drop into a raw SQL editor for anything requiring advanced logic.',
      arcliEvolution:
        "Arcli removes the visual ceiling. Instead of clicking through menus and hitting a complexity wall, users describe their logic in plain English — and the AI writes the advanced SQL natively. Your data stays in your own database; Arcli connects read-only and returns only the results.",
      theBottomLine:
        "Metabase is a great fit for early-stage teams doing basic counts and simple filters. Arcli is better suited for scaling teams that need deep analytical logic but don't want to require business operators to learn SQL.",
    },
    evaluationMatrix: [
      {
        category: 'The Complexity Ceiling',
        competitorApproach:
          'The visual builder struggles with recursive CTEs, complex JSON unwrapping, or multi-layered window functions — these typically require dropping into the SQL editor.',
        arcliAdvantage:
          'The AI natively writes complex SQL in PostgreSQL, Snowflake, and BigQuery dialects, meaning non-technical users can execute advanced analytical logic through plain English.',
        businessImpact:
          'Business operators are rarely blocked by a technical wall. Teams that need deep analytical answers can get them without waiting on an engineer.',
        highlight: 'speed',
      },
      {
        category: 'Infrastructure Overhead',
        competitorApproach:
          'Self-hosting requires managing a Java runtime environment, memory tuning, and version upgrades — ongoing DevOps work.',
        arcliAdvantage:
          'Fully managed cloud architecture with nothing to deploy, maintain, or scale on your side.',
        businessImpact:
          'Recovers engineering and DevOps time currently spent managing self-hosted BI infrastructure.',
        highlight: 'cost',
      },
      {
        category: 'Conversational State',
        competitorApproach:
          'Dashboards are largely static. Drill-downs must be pre-configured by an analyst before a meeting.',
        arcliAdvantage:
          'Arcli maintains conversation history. Asking "What about just Enterprise tier?" modifies the previous query automatically — no rebuilding required.',
        businessImpact:
          'Enables genuine data exploration and real-time analysis during live executive discussions.',
        highlight: 'speed',
      },
    ],
    synergyScenario: {
      headline: 'Graduating from Basic BI',
      howTheyWorkTogether:
        'Most companies adopt Metabase early on, then hit a wall as their data models become more complex — particularly with nested JSON logs or multi-schema joins.',
      workflow: [
        'Keep Metabase running for legacy embedded reports that are already stable.',
        'Deploy Arcli specifically for complex, unstructured data sources (like Postgres JSONB columns or multi-table event logs).',
        'Allow Customer Success and Product teams to query unstructured data in natural language via Arcli, bypassing the visual builder limits entirely.',
      ],
    },
    roiAnalysis: [
      {
        metric: 'Data Request Deflection',
        competitorAverage: '~40% (simple questions only)',
        arcliAverage: '~85% (handles complex logic too)',
        financialValue:
          'Substantially reduces the volume of "Can you write a quick SQL snippet for this?" requests that land in the engineering queue.',
      },
      {
        metric: 'Infrastructure Maintenance',
        competitorAverage: '4+ Hours / Month (runtime tuning)',
        arcliAverage: '0 Hours (fully managed)',
        financialValue:
          'Eliminates infrastructure babysitting so engineering stays focused on product.',
      },
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'How many users signed up yesterday?',
        competitorFriction:
          'Requires several clicks through the visual builder: select table, filter by date, summarize by count.',
        arcliResolution: 'Type "Signups yesterday." Renders instantly.',
      },
      {
        complexity: 'Advanced',
        businessQuestion:
          'Find customers who upgraded their subscription tier but had three or more support tickets beforehand.',
        competitorFriction:
          'Difficult via visual builder alone — typically requires a data engineer to write a multi-table join with subqueries in the SQL editor.',
        arcliResolution:
          'Arcli identifies the relationship between your subscription events and your support ticket tables and orchestrates the logic based on your plain-English description.',
      },
      {
        complexity: 'Strategic',
        businessQuestion:
          'Show me a 7-day rolling average of daily active users (DAU) for the past 30 days.',
        competitorFriction:
          'Rolling averages across rows are not supported by the visual builder. Users must switch to the SQL editor and write the Window Function manually.',
        arcliResolution:
          'Arcli understands the rolling average concept and generates the correct SQL Window Function automatically.',
        sqlGenerated: `SELECT
  event_date,
  dau_count,
  AVG(dau_count) OVER (
    ORDER BY event_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rolling_7_day_avg
FROM (
  SELECT
    DATE_TRUNC('day', created_at) AS event_date,
    COUNT(DISTINCT user_id) AS dau_count
  FROM user_events
  WHERE created_at >= CURRENT_DATE - 30
  GROUP BY 1
)
ORDER BY event_date DESC;`,
      },
    ],
    faqs: [
      {
        q: 'Can I still write my own SQL in Arcli?',
        a: 'Yes. While the AI handles most query authoring, you always have access to a full SQL editor to inspect, modify, and execute queries directly.',
      },
      {
        q: 'Is it hard to map our schema?',
        a: 'Not at all. Arcli reads your schema metadata and foreign key relationships upon connection via its read-only access, making it ready to query immediately.',
      },
      {
        q: 'Does Arcli support native JSON and array unwrapping?',
        a: 'Yes. Arcli generates dialect-specific JSON extraction logic (like Postgres `->>` or BigQuery `UNNEST`) — operations that visual builders often handle poorly.',
      },
      {
        q: 'How do you handle dashboard organization compared to Metabase collections?',
        a: 'Arcli organizes insights around team objectives and conversational threads rather than static folder hierarchies, making it easier to find the context behind how a chart was created.',
      },
      {
        q: 'We self-host Metabase for security. How does Arcli handle this?',
        a: 'Arcli operates exclusively over a read-only connection and never stores your raw data in our systems. All computation happens in your own database, giving you strong security without the DevOps overhead of self-hosting.',
      },
      {
        q: 'What happens when a query takes too long?',
        a: 'Heavy queries are processed entirely by your database. Arcli streams only the aggregated results back, preventing browser timeouts common in architectures that move large datasets to an intermediate layer.',
      },
    ],
    relatedSlugs: [
      'looker-vs-ai-analytics',
      'powerbi-vs-ai-analytics',
      'postgresql-ai-analytics',
    ],
  },

  'looker-vs-ai-analytics': {
    type: 'comparison',
    title: 'Looker vs AI Analytics: Bypassing the LookML Bottleneck | Arcli',
    description:
      "Compare Google Looker's rigid LookML modeling against Arcli's dynamic AI schema mapping. Learn how conversational analytics accelerates speed-to-insight.",
    metaKeywords: [
      'Looker Alternative',
      'Looker vs Arcli',
      'LookML',
      'Semantic Layer',
      'Generative AI BI',
      'Google Cloud Analytics',
    ],
    h1: 'Dynamic AI vs. The LookML Bottleneck',
    subtitle:
      "Looker requires months of engineering to define its semantic layer before anyone can ask a question. Arcli maps your schema at query time, delivering agility without sacrificing governance.",
    icon: <Layers className="w-12 h-12 text-blue-400 mb-6" />,
    corePhilosophy: {
      competitorFocus:
        'Looker is an enterprise platform built on LookML — a powerful but strict modeling language. Before anyone can run a query, a data engineer must explicitly define every metric, table, and join path. The result is a highly governed, reliable semantic layer, but one that requires constant engineering maintenance.',
      arcliEvolution:
        "Arcli maps your data relationships at query time using your live schema, eliminating the upfront modeling requirement. Business users define logic in plain English, and Arcli writes the underlying SQL — all via a read-only connection to your database.",
      theBottomLine:
        "If you need rigid, version-controlled enterprise financial reporting with strict governance, Looker is excellent. If your business operators need fast, ad-hoc answers without waiting weeks for an engineer to update the model, Arcli is a strong complement or alternative depending on your team's scale.",
    },
    evaluationMatrix: [
      {
        category: 'Deployment & Setup Time',
        competitorApproach:
          'Typically takes 3–6 months to fully model an enterprise database in LookML before widespread usage can begin.',
        arcliAdvantage:
          'Setup takes minutes. Arcli reads your schema on connection and is ready to query immediately via a read-only role.',
        businessImpact:
          'Teams are analyzing data on day one rather than month three.',
        highlight: 'speed',
      },
      {
        category: 'The Semantic Layer',
        competitorApproach:
          'Static and engineer-dependent. Any change to business logic or a new table requires a LookML developer to write code, commit to Git, and deploy.',
        arcliAdvantage:
          'Dynamic and conversational. Business users define logic in plain English ("Consider active users as anyone who logged in this week"), and the AI applies it consistently.',
        businessImpact:
          'Removes the engineering queue from routine metric updates, allowing business units to iterate at their own pace.',
        highlight: 'speed',
      },
      {
        category: 'Query Flexibility',
        competitorApproach:
          "Explores are limited to the join paths engineers have pre-defined. If a relationship isn't modeled, the question typically cannot be answered through the UI.",
        arcliAdvantage:
          'The AI can infer multi-hop joins across any accessible tables that share logical keys, without requiring pre-modeling.',
        businessImpact:
          'Reduces "dead ends" during data exploration and makes it easier for teams to discover unexpected insights.',
        highlight: 'speed',
      },
    ],
    synergyScenario: {
      headline: 'The Two-Tiered Data Strategy',
      howTheyWorkTogether:
        "Modern enterprises don't need to choose between governance and agility — both are achievable with the right tool for each job.",
      workflow: [
        'Use Looker strictly for Tier-1 Financials: the board-level metrics that require absolute, version-controlled governance and formal audit trails.',
        'Deploy Arcli for Operational Agility: give product, sales, and marketing teams a way to run ad-hoc queries, A/B test analysis, and daily telemetry exploration independently.',
        'This approach relieves the LookML engineering queue while keeping the business moving fast between planning cycles.',
      ],
    },
    roiAnalysis: [
      {
        metric: 'Data Engineering Bandwidth',
        competitorAverage: '~50% dedicated to LookML maintenance',
        arcliAverage: '~5% dedicated to metadata oversight',
        financialValue:
          'Frees senior data engineers to focus on predictive models and infrastructure rather than maintaining syntax for routine report requests.',
      },
      {
        metric: 'Total Cost of Ownership (TCO)',
        competitorAverage: 'High (licensing + specialized developer salaries)',
        arcliAverage: 'Lower (no mandatory LookML specialist required)',
        financialValue:
          'Reduces BI costs by removing the dependency on specialized LookML engineers for routine business logic updates.',
      },
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'What are our top performing marketing channels this week?',
        competitorFriction:
          "A simple dashboard if the Marketing Spend explore has been pre-configured and joined to revenue tables — but that setup must happen first.",
        arcliResolution:
          'Arcli joins campaigns to orders dynamically and renders the chart immediately, regardless of whether those tables were pre-modeled.',
      },
      {
        complexity: 'Advanced',
        businessQuestion:
          'Analyze our support ticket volume against product deployments over the last quarter.',
        competitorFriction:
          'Requires an engineer to build a new LookML join path bridging the engineering deployment tables with the customer success tables — typically a multi-day effort.',
        arcliResolution:
          "Arcli identifies the temporal relationship between deployments and ticket spikes and generates the cross-schema query based on the plain-English description.",
      },
      {
        complexity: 'Strategic',
        businessQuestion:
          'Identify the 90th percentile of order processing times grouped by warehouse location.',
        competitorFriction:
          'Requires complex custom SQL blocks embedded within LookML to handle percentile functions, which vary by database dialect.',
        arcliResolution:
          "Arcli generates the correct dialect-specific percentile function for your cloud data warehouse without any manual SQL authoring.",
        sqlGenerated: `SELECT
  warehouse_location,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (shipped_at - created_at)) / 3600
  ) AS p90_processing_hours
FROM fulfillment_logs
WHERE created_at >= CURRENT_DATE - 90
GROUP BY 1
ORDER BY 2 DESC;`,
      },
    ],
    faqs: [
      {
        q: 'Does Arcli integrate with existing dbt models?',
        a: "Yes. Arcli reads your dbt schema.yml files on connection, automatically inheriting all table descriptions and relationships your engineering team has already defined.",
      },
      {
        q: 'How do you ensure metric consistency without LookML?',
        a: "You can define a metric once in plain English inside Arcli's Semantic Metrics layer (e.g., \"Net Revenue = Gross minus Refunds minus Taxes\"), and the AI applies that definition consistently across all future queries.",
      },
      {
        q: 'Can Arcli handle large BigQuery or Snowflake instances?',
        a: "Yes. Like Looker, Arcli pushes computation down to your cloud data warehouse. Arcli generates the optimized SQL; your warehouse does the heavy lifting. Only the small, aggregated result is returned.",
      },
      {
        q: 'What happens if the AI generates an inefficient query?',
        a: 'Arcli includes cost-control guardrails. For platforms like BigQuery, it enforces partition filtering and avoids broad SELECT * patterns to help minimize data scan costs.',
      },
      {
        q: 'Is Arcli a complete replacement for Looker?',
        a: "It depends on scale and governance needs. Startups and mid-market companies often replace Looker to gain speed. Enterprise companies frequently use Arcli to handle the long-tail of ad-hoc requests while Looker governs core financial metrics.",
      },
      {
        q: 'Do business users need to understand database schemas?',
        a: 'No. The AI maps your business vocabulary ("customers", "sales") to your actual database columns, abstracting the technical layer entirely.',
      },
    ],
    relatedSlugs: [
      'snowflake-ai-analytics',
      'bigquery-ai-analytics',
      'tableau-vs-ai-analytics',
    ],
  },

  'domo-vs-ai-analytics': {
    type: 'comparison',
    title: 'Domo vs AI Analytics: Zero Data Movement | Arcli',
    description:
      "Evaluate Domo's proprietary data cloud against Arcli's zero-data-movement architecture. Understand how push-down compute reduces vendor lock-in and compliance risk.",
    metaKeywords: [
      'Domo Alternative',
      'Domo vs Arcli',
      'Zero Data Movement',
      'Cloud BI',
      'Push Down Compute',
      'Vendor Lock-in',
    ],
    h1: 'The Case for Zero Data Movement',
    subtitle:
      'Domo requires moving your data into their proprietary cloud. Arcli queries your data where it already lives — prioritizing security, real-time accuracy, and your freedom to change tools.',
    icon: <Cloud className="w-12 h-12 text-sky-400 mb-6" />,
    corePhilosophy: {
      competitorFocus:
        "Domo acts as an all-in-one platform. It connects to your databases and APIs, ingests data into its own proprietary cloud storage, and asks you to transform and visualize it there. This gives you a single vendor for everything, at the cost of data portability.",
      arcliEvolution:
        "Arcli's architecture is the opposite. Your data stays in your database. Arcli connects read-only, pushes the computation down to your existing infrastructure, and returns only the final visualization — no raw data movement required.",
      theBottomLine:
        "If you don't yet have a data warehouse and need an all-in-one ingestion platform, Domo is worth evaluating. If you already have Snowflake, BigQuery, or Postgres and want to query it securely without duplicating data or creating compliance risk, Arcli is a more efficient fit.",
    },
    evaluationMatrix: [
      {
        category: 'Data Architecture',
        competitorApproach:
          "Ingest-heavy. Raw data is piped into Domo's cloud, creating a secondary copy of your source-of-truth and introducing potential data freshness and compliance considerations.",
        arcliAdvantage:
          "Push-down compute. Arcli acts as a stateless layer. Data never leaves your secure environment; only the aggregated chart results are sent to the browser.",
        businessImpact:
          "Maintains data sovereignty, simplifies compliance (SOC 2, GDPR), and eliminates the risk of stale, out-of-sync datasets across platforms.",
        highlight: 'security',
      },
      {
        category: 'Vendor Lock-in',
        competitorApproach:
          "High. Because your transformations live inside Domo's proprietary environment, migrating away from the platform tends to be time-consuming and expensive.",
        arcliAdvantage:
          "Minimal lock-in. Arcli sits lightly on top of your stack via a read-only connection. Your models and raw data remain entirely under your control.",
        businessImpact:
          'Preserves your architectural leverage and avoids the pricing risk of depending on a single vendor for both storage and analytics.',
        highlight: 'cost',
      },
      {
        category: 'Total Storage and Egress Costs',
        competitorApproach:
          'You pay for your cloud database, plus egress fees to move data to Domo, plus the platform\'s own storage and compute costs.',
        arcliAdvantage:
          'You pay only for your existing database compute. Arcli introduces no redundant storage layer.',
        businessImpact:
          'Substantially lowers the total cost of ownership for enterprise analytics over a multi-year horizon.',
        highlight: 'cost',
      },
    ],
    synergyScenario: {
      headline: 'Reclaiming Your Data Gravity',
      howTheyWorkTogether:
        'Companies moving away from Domo often use Arcli as the modernization bridge.',
      workflow: [
        'Centralize your raw data back into a modern cloud data warehouse (Snowflake, BigQuery, or similar).',
        'Use standard transformation tools like dbt within your own environment.',
        "Deploy Arcli as the conversational analytics frontend — replacing Domo's visualization suite without any vendor dependency on where your data lives.",
      ],
    },
    roiAnalysis: [
      {
        metric: 'Data Storage Redundancy',
        competitorAverage: 'Full duplication of source data',
        arcliAverage: 'Zero duplication',
        financialValue:
          'Eliminates redundant cloud storage costs and data egress fees that scale significantly as data volume grows.',
      },
      {
        metric: 'Data Freshness',
        competitorAverage: 'Delayed (waits for next sync cycle)',
        arcliAverage: 'Real-time (direct read-only query)',
        financialValue:
          'Provides immediate operational visibility during critical business situations without waiting for batch ETL jobs to complete.',
      },
    ],
    executiveScenarios: [
      {
        complexity: 'Basic',
        businessQuestion: 'Show me inventory levels by warehouse right now.',
        competitorFriction:
          "Users typically wait for the next scheduled data sync before seeing updated inventory in Domo's cloud — which may be hours behind.",
        arcliResolution:
          'Arcli queries the live operational read-replica directly, returning up-to-the-minute stock levels.',
      },
      {
        complexity: 'Advanced',
        businessQuestion:
          'What is the correlation between specific application errors and subscription churn?',
        competitorFriction:
          "Moving unstructured application error logs into Domo's cloud tends to be slow and expensive given the volume of raw log data involved.",
        arcliResolution:
          'Arcli pushes the entire search and aggregation down to your data warehouse, processing the correlation natively without moving raw log data over the wire.',
      },
      {
        complexity: 'Strategic',
        businessQuestion:
          'Calculate a predictive lifetime value (LTV) trendline based on the last 3 years of transactional data.',
        competitorFriction:
          "Domo's proprietary transformation blocks abstract the underlying math, making it difficult for data scientists to audit or validate the methodology independently.",
        arcliResolution:
          "Arcli generates explicit, readable SQL that uses your database's native statistical functions — the logic is always visible and auditable.",
        sqlGenerated: `WITH monthly_spend AS (
  SELECT
    user_id,
    DATE_TRUNC('month', created_at) AS mth,
    SUM(amount) AS spend
  FROM transactions
  GROUP BY 1, 2
)
SELECT
  mth,
  AVG(SUM(spend) OVER (PARTITION BY user_id ORDER BY mth)) AS avg_cumulative_ltv
FROM monthly_spend
GROUP BY 1
ORDER BY 1 ASC;`,
      },
    ],
    faqs: [
      {
        q: "If Arcli doesn't store data, how does it process large queries?",
        a: "Arcli writes optimized SQL and sends it to your database (Snowflake, BigQuery, Postgres, etc.). Your database performs the computation; Arcli retrieves only the small, aggregated result and visualizes it in the browser.",
      },
      {
        q: 'Is Arcli compliant with data privacy laws (GDPR / HIPAA)?',
        a: 'Because Arcli does not permanently store your PII or raw transaction data, it significantly simplifies compliance architectures compared to platforms that ingest and replicate your data.',
      },
      {
        q: 'Does Arcli offer ETL capabilities like Domo?',
        a: "Arcli is an analytics and visualization layer, not a data mover. We believe ETL is best handled by purpose-built tools (Fivetran, dbt, Airbyte) running within your own environment — Arcli complements that stack rather than replacing it.",
      },
      {
        q: 'Can Arcli render complex charts quickly without caching raw data?',
        a: 'Yes. Once the aggregated result set is returned from your database, Arcli renders interactive charts directly in the browser — only the small summarized data is involved, not your raw tables.',
      },
      {
        q: 'How does pricing compare to Domo?',
        a: "Because Arcli doesn't charge for redundant data storage or proprietary compute clusters, pricing tends to be more predictable and scales more favorably as your data volume grows.",
      },
      {
        q: 'Can we embed Arcli charts into our own application?',
        a: 'Yes. Arcli supports secure iframe-based embedding, letting you deliver analytics directly to your end-users without building a visualization layer from scratch.',
      },
    ],
    relatedSlugs: [
      'tableau-vs-ai-analytics',
      'snowflake-ai-analytics',
      'bigquery-ai-analytics',
    ],
  },
};