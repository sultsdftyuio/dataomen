// lib/seo/core-features-1.tsx
import React from 'react';
import { Sparkles, LineChart, BarChart3 } from 'lucide-react';

/**
 * CoreFeatures Schema - V2 "Business Outcome" Edition
 * This schema is specifically designed to hit 500+ lines of high-authority 
 * content while remaining accessible to non-technical executive buyers.
 */
export type SEOPageData = {
  type: 'feature';
  title: string;
  description: string;
  metaKeywords: string[];
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  businessValueMetrics: {
    label: string;
    value: string;
    description: string;
  }[];
  capabilities: {
    name: string;
    benefit: string;
    nonTechExplanation: string;
  }[];
  technicalGuardrails: {
    concern: string;
    arcliSolution: string;
  }[];
  onboardingExperience: {
    phase: string;
    userAction: string;
    aiResponse: string;
  }[];
  analyticalScenarios: {
    title: string;
    complexity: 'Basic' | 'Advanced' | 'Strategic';
    prompt: string;
    logicApplied: string;
    resultInsight: string;
    sqlSnippet?: string;
  }[];
  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const coreFeaturesPart1: Record<string, SEOPageData> = {
  'ai-data-analysis': {
    type: 'feature',
    title: 'Conversational AI Data Analysis & Exploration | Arcli',
    description: 'Transform raw database tables into clear business answers instantly. Arcli uses generative AI to automate the complex math of data exploration and statistical discovery.',
    metaKeywords: ['AI Data Analysis', 'Natural Language Analytics', 'Automated EDA', 'Data Exploration AI', 'Business Intelligence Chat', 'SQL Generation AI'],
    h1: 'Analysis at the Speed of Thought',
    subtitle: 'Stop waiting for data tickets. Ask your database questions in plain English and receive mathematically verified insights in seconds, not days.',
    icon: <Sparkles className="w-12 h-12 text-blue-500 mb-6" />,
    businessValueMetrics: [
      { label: 'Time to Insight', value: '98% Faster', description: 'Moves from "Question" to "Interactive Chart" in 5 seconds vs. hours of manual SQL authoring.' },
      { label: 'Analyst Productivity', value: '+15hrs / week', description: 'Reclaims technical bandwidth spent on repetitive ad-hoc reporting for higher-value architectural work.' },
      { label: 'Team Adoption', value: '4.5x Higher', description: 'Non-technical leads use data more frequently when they can simply "chat" with their metrics rather than using complex UIs.' }
    ],
    capabilities: [
      { 
        name: 'Conversational Exploration', 
        benefit: 'Lowering the technical floor.', 
        nonTechExplanation: 'If you can describe what you want to see (e.g., "Who are our most valuable users in New York?"), Arcli builds the report for you instantly.' 
      },
      { 
        name: 'Statistical Anomaly Detection', 
        benefit: 'Catching errors before they scale.', 
        nonTechExplanation: 'The AI automatically monitors your revenue streams and flags unusual spikes or dips so you don’t have to hunt for them manually.' 
      },
      { 
        name: 'Automated Data Sanitization', 
        benefit: 'Ensuring calculation integrity.', 
        nonTechExplanation: 'Arcli identifies and fixes messy date formats, duplicate entries, and missing values automatically before performing any math.' 
      },
      {
        name: 'Predictive Trend Projection',
        benefit: 'Seeing around the corner.',
        nonTechExplanation: 'Based on your historical growth, Arcli can project where your revenue will be in 6 months using advanced linear algebra.'
      }
    ],
    technicalGuardrails: [
      { concern: 'Will the AI hallucinate or invent fake numbers?', arcliSolution: 'We utilize strict Metadata Grounding. The AI is only permitted to use table and column names that have been verified by our secure schema scanner.' },
      { concern: 'Is there a risk of data deletion?', arcliSolution: 'Our "Zero-Risk" architecture mandates read-only credentials. The application layer physically strips any commands that could alter your data.' },
      { concern: 'How does it handle complex relational joins?', arcliSolution: 'The Semantic Router understands foreign keys. It can join 5+ tables automatically by following the logical relationships in your database.' }
    ],
    onboardingExperience: [
      { phase: 'Network Sync', userAction: 'Paste your secure read-only database URL.', aiResponse: 'Arcli maps your entire data structure and identifies key business metrics in seconds.' },
      { phase: 'Natural Querying', userAction: 'Type: "How is our user retention looking this month vs last month?"', aiResponse: 'The engine identifies the event tables and writes the complex cohort SQL.' },
      { phase: 'Transparent Verification', userAction: 'Review the generated logic and chart.', aiResponse: 'The AI provides a plain-English explanation of exactly how it calculated the retention rate.' }
    ],
    analyticalScenarios: [
      {
        title: 'Detecting Hidden Revenue Leaks',
        complexity: 'Advanced',
        prompt: 'Find any days where transaction volume dropped by more than 20% compared to the 30-day moving average.',
        logicApplied: 'Calculates a rolling 30-day average and compares current daily volume to identify statistical outliers.',
        resultInsight: 'Isolated a silent payment gateway failure on Tuesday that blocked 400 checkout attempts but didnt trigger a server error.',
        sqlSnippet: `WITH stats AS (SELECT date_trunc('day', created_at) as d, count(*) as v FROM orders GROUP BY 1) SELECT d, v FROM stats WHERE v < (SELECT AVG(v) * 0.8 FROM stats WHERE d > CURRENT_DATE - 30);`
      },
      {
        title: 'Product-Led Growth Analysis',
        complexity: 'Strategic',
        prompt: 'Compare the 7-day retention of users who used the "Team Invite" feature versus those who did not.',
        logicApplied: 'Performs a cohort analysis by joining user signups with specific feature engagement events.',
        resultInsight: 'Users who invite teammates have a 310% higher retention rate, validating the current product roadmap focus.',
      },
      {
        title: 'Basic Monthly Growth',
        complexity: 'Basic',
        prompt: 'What was our total revenue growth month-over-month this year?',
        logicApplied: 'Simple aggregation of revenue grouped by month with a percentage change calculation.',
        resultInsight: 'Growth has stabilized at 8.2% per month throughout Q3.',
      }
    ],
    faqs: [
      { q: 'Is my raw data used to train your AI models?', a: 'Absolutely not. We employ "Stateless RAG." Your actual customer data never leaves your secure perimeter; only table headers are used to help the AI write queries.' },
      { q: 'Can Arcli handle our custom database views?', a: 'Yes. Arcli treats custom views exactly like tables, inheriting the column names and data types you have already defined.' },
      { q: 'What happens if the AI writes a "slow" query?', a: 'Our Query Planner analyzes the complexity before execution. If a query is likely to time out, the AI suggests adding filters (like a date range) to ensure performance.' }
    ],
    relatedSlugs: ['ai-business-intelligence', 'postgresql-ai-analytics', 'snowflake-ai-analytics']
  },

  'ai-business-intelligence': {
    type: 'feature',
    title: 'Enterprise AI Business Intelligence & Metric Governance | Arcli',
    description: 'Centralize your company KPIs with AI. Ensure every department is using the same definitions for Revenue, Churn, and Growth using semantic governance.',
    metaKeywords: ['AI BI Tool', 'Metric Governance', 'dbt integration', 'Executive Dashboards', 'Self-Serve Data', 'Governance AI'],
    h1: 'One Truth, Powered by Intelligence',
    subtitle: 'Define your core metrics once. Allow your entire organization to query them securely in plain English without diverging from the "official" numbers.',
    icon: <LineChart className="w-12 h-12 text-cyan-500 mb-6" />,
    businessValueMetrics: [
      { label: 'Metric Accuracy', value: '100%', description: 'Eliminates conflicting reports from Sales and Finance by enforcing a single definition layer.' },
      { label: 'Implementation Speed', value: '< 24 Hours', description: 'Bypasses months of manual dashboard building by connecting to your existing dbt or SQL models instantly.' },
      { label: 'Governance Coverage', value: 'Complete', description: 'Every chart is tagged with its "Verified" source, giving leaders total confidence in the numbers.' }
    ],
    capabilities: [
      { 
        name: 'Semantic Metric Layer', 
        benefit: 'Universal Consistency.', 
        nonTechExplanation: 'You define "Active User" once in our settings, and Arcli ensures that exact logic is used every time an employee asks a question.' 
      },
      { 
        name: 'dbt Cloud Native Integration', 
        benefit: 'Leverage existing engineering.', 
        nonTechExplanation: 'Arcli automatically reads your dbt files, adopting the names and descriptions your data team has already built.' 
      },
      { 
        name: 'Automated Executive Briefings', 
        benefit: 'Passive Awareness.', 
        nonTechExplanation: 'Leaders receive a simple, written summary of their KPIs in Slack every Monday morning, explaining why the numbers moved.' 
      },
      {
        name: 'Root Cause Diagnostics',
        benefit: 'Answering the "Why."',
        nonTechExplanation: 'If revenue drops, you can ask Arcli "Why did this happen?" and it will analyze segments to find the exact cause.'
      }
    ],
    technicalGuardrails: [
      { concern: 'How do you handle complex business logic?', arcliSolution: 'We support dbt "ref" calls and Jinja templating. Arcli doesn\'t guess; it follows your pre-approved modeling code.' },
      { concern: 'Will repeated questions slow down our database?', arcliSolution: 'Arcli utilizes intelligent result caching. If two people ask the same question, we serve the cached result set rather than re-running the query.' },
      { concern: 'Can I restrict access to sensitive HR data?', arcliSolution: 'Yes. We support Role-Based Access Control (RBAC). You can hide entire tables or specific columns (like Salaries) from the AI router.' }
    ],
    onboardingExperience: [
      { phase: 'Semantic Sync', userAction: 'Link your dbt repository or upload core schemas.', aiResponse: 'Arcli adopts your custom business terminology and metric formulas instantly.' },
      { phase: 'Verification', userAction: 'Mark "MRR" as a Verified Metric.', aiResponse: 'All future queries regarding revenue will now be locked to this specific code.' },
      { phase: 'Democratize', userAction: 'Open the portal to the broader management team.', aiResponse: 'Operators can now self-serve board-ready reports without a data analyst.' }
    ],
    analyticalScenarios: [
      {
        title: 'Quarterly Financial Health',
        complexity: 'Strategic',
        prompt: 'What is our Net Revenue Retention for Enterprise clients, grouped by their account manager?',
        logicApplied: 'Joins current subscription data with historical snapshots to calculate expansion and churn per account.',
        resultInsight: 'Enterprise NRR is at 112%, but one specific region is seeing higher churn due to a legacy feature phase-out.',
        sqlSnippet: `SELECT am, SUM(current_rev) / SUM(original_rev) as nrr FROM {{ ref('governed_revenue_metrics') }} GROUP BY 1;`
      },
      {
        title: 'Operational Bottleneck Discovery',
        complexity: 'Advanced',
        prompt: 'Which support categories have the highest "Time to Close" over the last 90 days?',
        logicApplied: 'Analyzes timestamp differences between ticket creation and resolution across categories.',
        resultInsight: 'Technical integrations take 3x longer than billing issues, indicating a need for better documentation.',
      }
    ],
    faqs: [
      { q: 'Does Arcli replace tools like Tableau or Looker?', a: 'Arcli complements them. Keep your rigid financial reports in Looker, but use Arcli for the 500+ ad-hoc questions your team has every month that are too small for a Jira ticket.' },
      { q: 'Can I define metrics using standard SQL?', a: 'Yes. You can paste your existing "Single Source of Truth" SQL into our Governance layer, and the AI will use it as the definitive formula.' },
      { q: 'Does it work with Snowflake Row-Level Security?', a: 'Yes. Arcli inherits the permissions of the database user account it connects with, ensuring data privacy is maintained at the source.' }
    ],
    relatedSlugs: ['ai-data-analysis', 'ai-dashboard-builder', 'tableau-vs-ai-analytics']
  },

  'ai-dashboard-builder': {
    type: 'feature',
    title: 'Automated AI Dashboard Designer & Builder | Arcli',
    description: 'Build interactive, real-time business dashboards using natural language. Just describe what you want to track and let Arcli handle the design.',
    metaKeywords: ['AI Dashboard Builder', 'Automated Visualization', 'React Dashboard AI', 'SaaS Dashboard Generator', 'Live SQL Dashboard'],
    h1: 'Dashboards That Build Themselves',
    subtitle: 'Move beyond manual widget dragging. Describe your reporting goals, and Arcli constructs a tailored, interactive layout with live data in seconds.',
    icon: <BarChart3 className="w-12 h-12 text-purple-500 mb-6" />,
    businessValueMetrics: [
      { label: 'Build Time', value: '< 60 Seconds', description: 'Replaces hours of manual chart configuration and layout adjustments.' },
      { label: 'Deployment Ease', value: '1-Click', description: 'Instantly publish a secure, live-updating URL for your stakeholders.' },
      { label: 'Interactive Depth', value: 'Infinite', description: 'Dashboards aren\'t just images; they are conversational spaces where you can ask follow-up questions.' }
    ],
    capabilities: [
      { 
        name: 'Prompt-to-Dashboard', 
        benefit: 'Design by talking.', 
        nonTechExplanation: 'Simply type "Build a sales health dashboard for the CEO" and Arcli creates a suite of relevant charts and metrics automatically.' 
      },
      { 
        name: 'Intelligent Layout Design', 
        benefit: 'Expert organization.', 
        nonTechExplanation: 'Arcli uses design best practices to place the most important metrics at the top and group related data together for clarity.' 
      },
      { 
        name: 'Dynamic Real-Time Sync', 
        benefit: 'Zero Stale Data.', 
        nonTechExplanation: 'Your charts aren\'t snapshots. They refresh automatically as soon as a new sale or event hits your database.' 
      },
      {
        name: 'White-Labeled Embedding',
        benefit: 'Sharing with customers.',
        nonTechExplanation: 'You can embed these AI dashboards directly into your own app or customer portal using a simple code snippet.'
      }
    ],
    technicalGuardrails: [
      { concern: 'How do I know the charts are correct?', arcliSolution: 'Every dashboard widget is transparent. You can click any chart to see the exact SQL and data source behind it.' },
      { concern: 'Will it work on my phone?', arcliSolution: 'Arcli uses a responsive layout engine. Dashboards automatically resize to look perfect on mobile, tablet, and desktop.' },
      { concern: 'Can I export the data?', arcliSolution: 'Yes. Every chart includes a "Download CSV" option for users who need to take the raw data into Excel for secondary use.' }
    ],
    onboardingExperience: [
      { phase: 'Target', userAction: 'Prompt: "Create a customer success dashboard."', aiResponse: 'Arcli scans your support, usage, and billing tables for relevant KPIs.' },
      { phase: 'Generation', userAction: 'Arcli builds the UI.', aiResponse: 'A multi-chart dashboard is rendered with filters for "Account Manager" and "Date Range".' },
      { phase: 'Iterate', userAction: 'Type: "Add a map showing ticket volume by state."', aiResponse: 'The dashboard updates in real-time with the new visualization.' }
    ],
    analyticalScenarios: [
      {
        title: 'Live Product Launch Tracking',
        complexity: 'Strategic',
        prompt: 'Build a dashboard for the new feature launch. Track adoption rate, error volume, and conversion to paid.',
        logicApplied: 'Groups multiple queries across disparate tables (events, logs, and stripe) into a unified view.',
        resultInsight: 'Real-time monitoring allowed the team to fix a friction point in the checkout flow within 2 hours of launch.',
      },
      {
        title: 'Weekly Team Sync',
        complexity: 'Basic',
        prompt: 'Create a simple table showing the top 10 leads from this week.',
        logicApplied: 'Simple sort and limit on the CRM table filtered by the current week.',
        resultInsight: 'Keeps the sales team aligned on high-priority outreach.',
      }
    ],
    faqs: [
      { q: 'Can I customize the charts manually after they are generated?', a: 'Absolutely. Arcli provides a "Smart Baseline," but you can change colors, labels, and chart types manually at any time.' },
      { q: 'How many dashboards can I create?', a: 'Unlimited. Arcli is built for "Ephemeral Dashboards"—create one to answer a specific question today, and delete it when you no longer need it.' }
    ],
    relatedSlugs: ['ai-data-visualization-tool', 'marketing-dashboard-template', 'sales-dashboard-template']
  }
};