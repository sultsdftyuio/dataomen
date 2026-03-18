// lib/seo/templates.tsx
import React from 'react';
import { LayoutTemplate, DollarSign, Users, ShoppingCart } from 'lucide-react';

/**
 * SEOPageData Interface
 * Standardized for the Arcli high-performance analytical stack.
 * Upgraded to the "Search-Intent Machine" schema with real-world code examples,
 * pain-point targeting, and deep technical FAQs.
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

export const dashboardTemplates: Record<string, SEOPageData> = {
  'sales-dashboard-template': {
    type: 'template',
    title: 'AI Sales Dashboard Template | Arcli Analytics',
    description: 'Deploy our automated Sales Dashboard template to track win rates, pipeline velocity, and rep performance instantly via high-performance AI and RAG.',
    h1: 'The Ultimate AI Sales Leadership Dashboard',
    subtitle: 'Connect your CRM or warehouse and let our semantic AI instantiate a best-in-class sales leadership dashboard using highly optimized, vectorized KPI logic.',
    icon: <LayoutTemplate className="w-12 h-12 text-indigo-500 mb-6" />,
    features: [
      'Vectorized KPI Logic (Win Rates, Cycle Time)', 
      'Sub-second In-Browser Data Sync', 
      'Multi-tenant Rep Level Isolation',
      'Automated Pipeline Snapshotting'
    ],
    painPoints: {
      title: 'Why Native CRM Reporting is Broken',
      points: [
        'Salesforce and HubSpot native reports are rigid and require specialized admins to modify.',
        'Tracking historical pipeline changes (snapshotting) requires expensive add-ons.',
        'Combining CRM data with external quota or commission sheets in Excel leads to version control nightmares.'
      ],
      solution: 'Arcli bypasses clunky CRM report builders. We pull your raw data into our semantic engine and generate dynamic, real-time SQL models to calculate true pipeline velocity and rep efficiency without writing custom code.'
    },
    steps: [
      { name: '1. Select Template', text: 'Choose the Sales Executive Dashboard template from our AI library.' },
      { name: '2. Map Data Sources', text: 'Point the template to your Salesforce/HubSpot database via secure read-only connections.' },
      { name: '3. AI Deployment', text: 'Our RAG engine maps your specific CRM schema to standard sales metrics and instantiates the dashboard.' }
    ],
    realExample: {
      query: "Show me the win rate percentage by sales rep for the current quarter, excluding leads disqualified in the first stage.",
      sql: `WITH qualified_opportunities AS (
  SELECT owner_id, is_won, is_closed
  FROM opportunities
  WHERE created_at >= DATE_TRUNC('quarter', CURRENT_DATE)
    AND stage_name != 'Disqualified - Initial'
)
SELECT 
  u.name AS sales_rep,
  COUNT(*) FILTER (WHERE o.is_won = TRUE) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE o.is_closed = TRUE), 0) AS win_rate_pct
FROM qualified_opportunities o
JOIN users u ON o.owner_id = u.id
GROUP BY 1
ORDER BY 2 DESC;`,
      output: "Ranked Horizontal Bar Chart",
      insight: "Sarah Jenkins leads with a 42% win rate on highly qualified pipeline."
    },
    comparison: {
      competitor: 'Salesforce Native Dashboards',
      competitorFlaws: [
        'Extremely difficult to join cross-object data without complex Apex code.',
        'No ability to ask natural language follow-up questions.',
        'UI feels dated and charting capabilities are highly restricted.'
      ],
      arcliWins: [
        'Flawless cross-table joins automatically handled by schema RAG.',
        'Interactive chat interface for ad-hoc slicing (e.g., "Filter this by enterprise deals").',
        'Modern, high-performance Vega charting.'
      ]
    },
    useCases: [
      { title: 'Executive Visibility', description: 'Give your CRO real-time access to the metrics that matter with mathematical precision, without waiting on RevOps.' },
      { title: '1-on-1 Rep Coaching', description: 'Filter the entire dashboard context to a single rep instantly during pipeline review meetings.' }
    ],
    faqs: [
      { q: 'Can I modify the template after deploying?', a: 'Yes. Once deployed, you can use plain English to add, modify, or remove charts. The underlying AI simply rewrites the SQL to match your new requirements.' },
      { q: 'How does it handle custom CRM fields?', a: 'Our semantic indexer scans your metadata upon connection. It understands your custom fields (e.g., "target_launch_date__c") and seamlessly incorporates them into the LLM context window.' }
    ],
    relatedSlugs: ['how-to-analyze-sales-data', 'analyze-salesforce-data']
  },

  'saas-metrics-dashboard-template': {
    type: 'template',
    title: 'SaaS Metrics Dashboard Template | Arcli',
    description: 'Track MRR, ARR, Churn, LTV, and CAC automatically with our AI-powered, high-performance SaaS metrics dashboard template.',
    h1: 'Automated SaaS Financial Metrics Dashboard',
    subtitle: 'Stop calculating Net Revenue Retention in brittle Excel sheets. Deploy this template and track the exact health of your SaaS business with linear algebra-based precision.',
    icon: <DollarSign className="w-12 h-12 text-emerald-500 mb-6" />,
    features: [
      'Precise MRR/ARR Waterfall Tracking', 
      'Vectorized Cohort Retention Analysis', 
      'Automated CAC Payback Modeling',
      'Real-Time Subscription Event Streaming'
    ],
    painPoints: {
      title: 'The Nightmare of SaaS Revenue Recognition',
      points: [
        'Stripe native dashboards don\'t account for your specific refund policies or custom enterprise contracts.',
        'Calculating accurate Net Revenue Retention (NRR) requires complex self-joins to track cohort behavior over time.',
        'Spreadsheets break as soon as you surpass 10,000 monthly active subscriptions.'
      ],
      solution: 'Arcli handles the heavy lifting at the database layer. We use advanced window functions and CTEs to partition your revenue streams into exact buckets (New, Expansion, Contraction, Churn) with zero manual data entry.'
    },
    steps: [
      { name: '1. Connect Billing', text: 'Link your Stripe, Paddle, or custom payment processor database securely.' },
      { name: '2. Connect Product Data', text: 'Link your Postgres or Snowflake database to overlay active usage metrics against revenue.' },
      { name: '3. Generate Insights', text: 'The Arcli compute engine calculates complex SaaS metrics like NRR and Gross Margin instantly.' }
    ],
    realExample: {
      query: "Generate a monthly MRR waterfall showing new revenue, expansion, contraction, and churn for the last 6 months.",
      sql: `WITH mrr_movements AS (
  SELECT 
    DATE_TRUNC('month', billing_date) AS month,
    SUM(CASE WHEN movement_type = 'new' THEN amount ELSE 0 END) AS new_mrr,
    SUM(CASE WHEN movement_type = 'expansion' THEN amount ELSE 0 END) AS expansion_mrr,
    SUM(CASE WHEN movement_type = 'contraction' THEN amount ELSE 0 END) AS contraction_mrr,
    SUM(CASE WHEN movement_type = 'churn' THEN amount ELSE 0 END) AS churn_mrr
  FROM subscription_events
  WHERE billing_date >= CURRENT_DATE - INTERVAL '6 months'
  GROUP BY 1
)
SELECT * FROM mrr_movements ORDER BY month ASC;`,
      output: "Stacked Waterfall Bar Chart",
      insight: "Expansion MRR outpaced churn for the first time this quarter, pushing NRR to 104%."
    },
    comparison: {
      competitor: 'Point Solutions (ChartMogul, Baremetrics)',
      competitorFlaws: [
        'Creates another data silo outside of your main data warehouse.',
        'Rigid definitions of "Active User" or "Churn" that you cannot alter.',
        'Difficult to combine billing data with in-app product usage.'
      ],
      arcliWins: [
        'Operates directly on your data warehouse; zero data movement.',
        'Fully customizable metric definitions using natural language.',
        'Easily overlays product usage data with revenue data for health scoring.'
      ]
    },
    useCases: [
      { title: 'Board & Investor Reporting', description: 'Generate perfectly accurate, audit-ready SaaS metrics for your investor updates and board decks instantly.' },
      { title: 'Pricing Strategy', description: 'Analyze LTV by pricing tier to understand exactly which features are driving expansion revenue.' }
    ],
    faqs: [
      { q: 'Does it handle complex upgrades and downgrades?', a: 'Yes. Our template automatically partitions MRR movements by utilizing precise delta logic between billing periods to correctly categorize expansions vs. net-new revenue.' },
      { q: 'Can I track usage-based pricing models?', a: 'Absolutely. Arcli thrives on complex datasets. Simply point it to your metering database to calculate hybrid usage + flat-fee revenue models.' }
    ],
    relatedSlugs: ['analyze-stripe-data', 'ai-business-intelligence']
  },

  'marketing-dashboard-template': {
    type: 'template',
    title: 'Marketing ROI Dashboard Template | Arcli',
    description: 'Deploy our automated Marketing Dashboard template to track CAC, ROAS, and conversion funnels across all channels with zero data movement.',
    h1: 'The Ultimate AI Marketing Attribution Dashboard',
    subtitle: 'Stop merging siloed ad data in Excel. Deploy this template to track your true blended ROI using our semantic attribution AI.',
    icon: <Users className="w-12 h-12 text-pink-500 mb-6" />,
    features: [
      'Blended CAC & True ROAS Attribution', 
      'Vectorized Funnel Drop-off Calculation', 
      'Cross-Platform Semantic Sync',
      'Automated UTM Parameter Parsing'
    ],
    painPoints: {
      title: 'Why Marketing Attribution is Usually Guesswork',
      points: [
        'Ad platforms (Meta, Google) inherently over-report their own conversions.',
        'Connecting ad spend directly to closed-won revenue in the CRM is historically a data engineering nightmare.',
        'Calculating true blended CAC requires pulling from 5 different APIs daily.'
      ],
      solution: 'Arcli acts as the semantic bridge. By connecting your ad warehouse and CRM warehouse, our AI automatically writes the SQL to join UTM parameters to lead IDs, calculating true pipeline ROI per channel.'
    },
    steps: [
      { name: '1. Connect Ad Platforms', text: 'Ensure your Google Ads, Meta, and LinkedIn data is syncing to your warehouse (via Fivetran, Airbyte, etc.).' },
      { name: '2. Connect CRM', text: 'Link Salesforce or HubSpot to track actual closed-won revenue.' },
      { name: '3. Launch Template', text: 'The AI dynamically maps spend against recognized revenue to calculate true ROAS with sub-second rendering.' }
    ],
    realExample: {
      query: "Calculate the fully loaded Customer Acquisition Cost (CAC) by UTM Source for the last 90 days.",
      sql: `WITH ad_spend AS (
  SELECT utm_source, SUM(spend) as total_spend 
  FROM daily_ad_metrics 
  WHERE date >= CURRENT_DATE - 90 
  GROUP BY 1
),
new_customers AS (
  SELECT utm_source, COUNT(DISTINCT user_id) as total_customers
  FROM users 
  WHERE created_at >= CURRENT_DATE - 90 
  GROUP BY 1
)
SELECT 
  s.utm_source,
  s.total_spend,
  c.total_customers,
  s.total_spend / NULLIF(c.total_customers, 0) AS blended_cac
FROM ad_spend s
LEFT JOIN new_customers c ON s.utm_source = c.utm_source
ORDER BY blended_cac ASC;`,
      output: "Data Table with Heatmap Formatting",
      insight: "LinkedIn Ads CAC is $850, while Organic Search CAC remains at a highly efficient $42."
    },
    comparison: {
      competitor: 'Marketing Middleware (Funnel.io, Supermetrics)',
      competitorFlaws: [
        'Just moves data around, doesn\'t provide deep analytical intelligence.',
        'Extremely expensive volume-based pricing.',
        'Relies heavily on Looker Studio which suffers from high dashboard latency.'
      ],
      arcliWins: [
        'Analyzes the data exactly where it lives.',
        'Brings complex queries into browser-level DuckDB for zero-latency filtering.',
        'Allows marketers to ask follow-up questions in English rather than learning SQL.'
      ]
    },
    useCases: [
      { title: 'Performance Agency Reporting', description: 'Provide clients with perfectly transparent, real-time campaign performance dashboards that tie directly back to their revenue.' },
      { title: 'Budget Reallocation', description: 'Instantly identify which campaigns are burning cash without generating pipeline, and shift budget dynamically.' }
    ],
    faqs: [
      { q: 'Does it handle multi-touch attribution?', a: 'Yes. Depending on your schema, our AI can generate the logic for first-touch, last-touch, or linear attribution models based on your raw event tracking streams.' },
      { q: 'Can I track offline conversions?', a: 'If offline conversions are logged in your central database or CRM, Arcli will seamlessly incorporate them into your ROI calculations via schema mapping.' }
    ],
    relatedSlugs: ['google-analytics-ai-dashboard', 'sales-dashboard-template']
  },

  'ecommerce-dashboard-template': {
    type: 'template',
    title: 'E-Commerce Dashboard Template | Arcli Analytics',
    description: 'Track Shopify sales, inventory depletion, and LTV with our AI-powered, columnar e-commerce dashboard template.',
    h1: 'High-Velocity E-Commerce Analytics Dashboard',
    subtitle: 'Know exactly what your true margins are and when to reorder inventory with our plug-and-play e-commerce semantic template.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-400 mb-6" />,
    features: [
      'Columnar Inventory Depletion Forecasting', 
      'Vectorized LTV/CAC Ratio Tracking', 
      'High-Precision Margin & COGS Analytics',
      'Real-Time Cart Abandonment Funnels'
    ],
    painPoints: {
      title: 'The Blindspots in E-Commerce Analytics',
      points: [
        'Basic Shopify analytics don\'t factor in variable COGS, shipping, or ad spend, giving a false sense of profitability.',
        'Cohort analysis for repeat purchase rates is notoriously slow and difficult to build.',
        'Inventory forecasting is often done by guessing via historical Excel dumps.'
      ],
      solution: 'Arcli unites your Shopify, shipping, and ad spend data in the warehouse. We use AI to generate vectorized queries that calculate your True Net Margin by SKU in milliseconds.'
    },
    steps: [
      { name: '1. Centralize Data', text: 'Ensure your Shopify database and ad spend are housed in a central location (Postgres, BigQuery, Snowflake).' },
      { name: '2. Map COGS', text: 'Input or link your Cost of Goods Sold tables via our semantic interface.' },
      { name: '3. Deploy Insights', text: 'Get instant architectural visibility into profitability by SKU, returning customer rate, and inventory health.' }
    ],
    realExample: {
      query: "Show me the 30-day repeat purchase rate for customers acquired during our Black Friday sale vs standard months.",
      sql: `WITH black_friday_cohort AS (
  SELECT user_id FROM orders 
  WHERE order_date BETWEEN '2025-11-25' AND '2025-11-30'
  AND order_number = 1
),
bf_repeat_purchases AS (
  SELECT COUNT(DISTINCT user_id) as repeat_users 
  FROM orders 
  WHERE user_id IN (SELECT user_id FROM black_friday_cohort)
  AND order_date > '2025-11-30' AND order_date <= '2025-12-30'
)
SELECT 
  (SELECT repeat_users FROM bf_repeat_purchases) * 100.0 / 
  NULLIF((SELECT COUNT(*) FROM black_friday_cohort), 0) AS bf_30_day_repeat_rate;`,
      output: "Comparison KPI Cards",
      insight: "Black Friday cohorts have a 12% repeat purchase rate, significantly lower than our 22% annual baseline."
    },
    comparison: {
      competitor: 'Standard Shopify Analytics',
      competitorFlaws: [
        'No concept of blended customer acquisition cost (CAC).',
        'Cannot query custom historical data outside of predefined reports.',
        'Struggles with deep cohort segmentation.'
      ],
      arcliWins: [
        'Calculates True LTV to CAC ratios automatically.',
        'Allows deep conversational segmentation (e.g., "Show me margin for customers in California who bought socks").',
        'In-memory DuckDB processing allows massive dataset exploration without lag.'
      ]
    },
    useCases: [
      { title: 'Flash Sale Monitoring', description: 'Monitor live conversion rates, exact margins, and inventory depletion using our high-velocity compute engine during peak traffic events.' },
      { title: 'Merchandising Optimization', description: 'Identify which products act as "gateway" purchases that lead to the highest 12-month LTV.' }
    ],
    faqs: [
      { q: 'Can it track subscription boxes or recurring orders?', a: 'Yes. The AI handles recurring billing metrics natively, integrating flawlessly with subscription schemas like Recharge or Stripe Billing to calculate cohort retention.' },
      { q: 'How fast does the data update?', a: 'If your underlying database updates in real-time, Arcli queries it in real-time. Our zero-caching direct execution means you always see the freshest data.' }
    ],
    relatedSlugs: ['analyze-shopify-data', 'analyze-stripe-data']
  }
};