// lib/seo/saas-integrations.tsx
import React from 'react';
import { Cloud, ShoppingCart, Search } from 'lucide-react';

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

export const saasIntegrations: Record<string, SEOPageData> = {
  'analyze-salesforce-data': {
    type: 'integration',
    title: 'Analyze Salesforce Data with AI | Arcli Analytics',
    description: 'Connect Salesforce to Arcli. Use conversational AI to track pipeline velocity, rep performance, and complex cross-object metrics with sub-second latency.',
    h1: 'Chat With Your Salesforce Data in Plain English',
    subtitle: 'Stop fighting with rigid Salesforce Reports and complex SOQL queries. Ask questions about your pipeline in plain English and get instant architectural visibility.',
    icon: <Cloud className="w-12 h-12 text-sky-500 mb-6" />,
    features: [
      'Vectorized Pipeline Velocity Tracking', 
      'Dynamic Cross-Object Joins via RAG', 
      'Automated Custom Field Detection',
      'Sub-second In-Browser Charting'
    ],
    painPoints: {
      title: 'Why Salesforce Reporting is a Bottleneck',
      points: [
        'Native Salesforce report builders are rigid and require specialized admins to build cross-object relationships.',
        'Writing SOQL (Salesforce Object Query Language) lacks the analytical depth of standard SQL window functions.',
        'Exporting to Excel to merge CRM data with external quota sheets breaks version control and data freshness.'
      ],
      solution: 'Arcli bypasses the Salesforce UI entirely. We sync your standard and custom objects into a high-performance columnar format, map the relationships using our semantic engine, and allow you to query it using native SQL or plain English.'
    },
    steps: [
      { name: '1. Connect via OAuth', text: 'Authorize Arcli using secure, multi-tenant Salesforce OAuth protocols with read-only scoped access.' },
      { name: '2. Schema & Custom Field Detection', text: 'Our Semantic Router automatically scans and maps your complex schema, including all Custom Objects and __c fields.' },
      { name: '3. Ask Complex Questions', text: 'Ask "What is our win rate for Enterprise deals in EMEA, grouped by lead source?" and get a verified SQL execution.' }
    ],
    realExample: {
      query: "Show me the average sales cycle length (in days) for closed-won opportunities this year, grouped by the Account's Industry custom field.",
      sql: `SELECT 
  a.industry__c AS account_industry,
  AVG(DATE_PART('day', o.close_date::timestamp - o.created_date::timestamp)) AS avg_cycle_days,
  COUNT(o.id) AS total_won_deals
FROM salesforce_opportunities o
JOIN salesforce_accounts a ON o.account_id = a.id
WHERE o.is_won = TRUE 
  AND o.close_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY 1
HAVING COUNT(o.id) > 5
ORDER BY 2 DESC;`,
      output: "Horizontal Bar Chart with Average Line Overlay",
      insight: "Healthcare deals take an average of 142 days to close, nearly double the velocity of our SaaS vertical (74 days)."
    },
    comparison: {
      competitor: 'Salesforce Native Reports',
      competitorFlaws: [
        'Requires clicking through 5+ menus just to group by a secondary dimension.',
        'Hard limits on rows returned and complex aggregations.',
        'Cannot easily join with non-Salesforce data (like Stripe revenue).'
      ],
      arcliWins: [
        'Instant answers via natural language, powered by schema-aware LLMs.',
        'Leverages underlying SQL for unlimited analytical flexibility (CTEs, Window Functions).',
        'Easily joins Salesforce pipeline data with external billing databases.'
      ]
    },
    useCases: [
      { title: 'Sales Leadership Briefings', description: 'Generate automated weekly pipeline health dashboards for the CRO via secure RAG routing without waiting on RevOps.' },
      { title: 'Rep Performance Coaching', description: 'Instantly isolate a specific account executive to review their win/loss ratio against specific competitors tracked in custom fields.' }
    ],
    faqs: [
      { q: 'Can Arcli read my custom Salesforce objects and fields?', a: 'Yes. Upon connection, Arcli maps your entire metadata structure. Custom objects and fields (ending in __c) are embedded into our semantic router so the AI understands your unique business terminology natively.' },
      { q: 'Does this write back to Salesforce or alter my data?', a: 'No. Arcli operates on a strict Read-Only analytical basis. We extract the data for high-speed querying and charting, guaranteeing your underlying CRM records are never modified or deleted.' }
    ],
    relatedSlugs: ['sales-dashboard-template', 'natural-language-to-sql']
  },

  'analyze-shopify-data': {
    type: 'integration',
    title: 'Analyze Shopify E-Commerce Data with AI | Arcli',
    description: 'Turn your Shopify store data into actionable insights. Use Arcli to analyze inventory velocity, true margins, and customer LTV with AI.',
    h1: 'AI Intelligence for High-Volume Shopify Stores',
    subtitle: 'Connect your Shopify store and unlock enterprise-grade retail analytics. Stop guessing your true margins and let our high-performance compute engine calculate exact SKU profitability.',
    icon: <ShoppingCart className="w-12 h-12 text-emerald-500 mb-6" />,
    features: [
      'Predictive Inventory Forecasting', 
      'Vectorized Cohort LTV Tracking', 
      'True Net Margin & COGS Calculation',
      'Discount Code ROI Attribution'
    ],
    painPoints: {
      title: 'The Blindspots of Shopify Analytics',
      points: [
        'Native Shopify dashboards report on gross revenue, giving a dangerous and false sense of profitability by ignoring variable COGS and shipping.',
        'Calculating Customer Lifetime Value (LTV) across specific monthly cohorts is notoriously slow and difficult.',
        'Inventory reorder forecasting is usually done by guessing via historical Excel exports.'
      ],
      solution: 'Arcli unites your Shopify orders, products, and inventory data. By allowing you to map COGS to SKUs, our AI generates vectorized SQL queries that calculate your True Net Margin and LTV in milliseconds.'
    },
    steps: [
      { name: '1. Connect via App/API', text: 'Connect your Shopify store via our secure integration portal using least-privilege, read-only access.' },
      { name: '2. Data Normalization', text: 'We automatically clean and map nested JSON order payloads, line items, and product catalogs into optimized columnar formats.' },
      { name: '3. Conversational Insights', text: 'Ask "Which product bundle had the highest net margin during the Black Friday sale?" for instant visualization.' }
    ],
    realExample: {
      query: "Calculate the total gross revenue, total discounts given, and net revenue for the 'SUMMER2025' discount code.",
      sql: `WITH discount_orders AS (
  SELECT 
    order_id,
    total_price AS gross_revenue,
    total_discounts
  FROM shopify_orders
  WHERE discount_codes @> '[{"code": "SUMMER2025"}]'::jsonb
)
SELECT 
  COUNT(order_id) AS total_orders,
  SUM(gross_revenue) AS total_gross_revenue,
  SUM(total_discounts) AS total_discount_amount,
  SUM(gross_revenue - total_discounts) AS net_revenue
FROM discount_orders;`,
      output: "Financial KPI Scorecard",
      insight: "The SUMMER2025 campaign drove $45k in net revenue, but gave away $12k in discounts, compressing margins by 18%."
    },
    comparison: {
      competitor: 'Basic E-commerce Dashboards',
      competitorFlaws: [
        'Struggles with nested JSON payloads (like line_items or discount_allocations).',
        'Cannot dynamically join marketing spend (Facebook/Google) to Shopify ROAS.',
        'Limited to pre-built, unmodifiable charts.'
      ],
      arcliWins: [
        'Natively unpacks and queries complex JSONB arrays in Shopify payloads.',
        'Allows for cross-platform joins (Shopify + Meta Ads) for true Blended CAC.',
        'Fully interactive React-Vega charting built via natural language.'
      ]
    },
    useCases: [
      { title: 'Inventory Velocity Management', description: 'Use predictive analytics to determine exact reorder points based on historical depletion rates and supplier lead times.' },
      { title: 'Merchandising Optimization', description: 'Identify which low-ticket items act as "gateway" purchases that lead to the highest 12-month Customer Lifetime Value.' }
    ],
    faqs: [
      { q: 'Does this slow down my store\'s front-end?', a: 'Not at all. Arcli syncs data asynchronously via the Shopify Admin API, operating entirely in the background with zero impact on your customer\'s checkout experience or page load speeds.' },
      { q: 'How does it handle massive stores with millions of orders?', a: 'Arcli utilizes heavily optimized columnar data structures (Parquet) and streams results into an in-browser WebAssembly engine (DuckDB). This allows us to aggregate millions of rows of transactional data with zero latency.' }
    ],
    relatedSlugs: ['ecommerce-dashboard-template', 'google-analytics-ai-dashboard']
  },

  'google-analytics-ai-dashboard': {
    type: 'integration',
    title: 'Google Analytics 4 AI Dashboard | Arcli',
    description: 'Connect GA4 to Arcli and use AI to analyze web traffic, conversion funnels, and marketing attribution bypassing the terrible native UI.',
    h1: 'AI-Powered Google Analytics (GA4)',
    subtitle: 'GA4 is notoriously complex and difficult to navigate. Connect it to Arcli and simply ask for the traffic and conversion metrics you need using plain English.',
    icon: <Search className="w-12 h-12 text-orange-500 mb-6" />,
    features: [
      'Conversational Event Analysis', 
      'Automated Funnel Drop-off Tracking', 
      'Cross-Platform Attribution Modeling',
      'Bypass GA4 UI Quotas and Lag'
    ],
    painPoints: {
      title: 'Why Everyone Hates GA4',
      points: [
        'The UI is incredibly unintuitive, burying basic reports like "Landing Pages" behind multiple confusing menus.',
        'Strict API quotas and heavy data sampling make standard reporting slow and inaccurate for high-traffic sites.',
        'It is nearly impossible to cleanly join GA4 session data with your actual backend database revenue.'
      ],
      solution: 'Arcli acts as a semantic intelligence layer over your GA4 data (usually exported to BigQuery). We translate your English questions into precise SQL, bypassing the GA4 UI completely to deliver unsampled, instant answers.'
    },
    steps: [
      { name: '1. Connect BigQuery Export', text: 'Link your GA4 BigQuery export to Arcli via secure, scoped credentials.' },
      { name: '2. Semantic Event Mapping', text: 'Our engine maps your standard (page_view, session_start) and custom events into an easily queryable structure.' },
      { name: '3. Analyze Traffic', text: 'Ask "What is the conversion rate of blog readers to paid signups by device category?" to see instant trends.' }
    ],
    realExample: {
      query: "Show me the top 5 landing pages by total sessions over the last 30 days, and include their average engagement time.",
      sql: `WITH session_data AS (
  SELECT 
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS landing_page,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time
  FROM ga4_events
  WHERE event_name = 'session_start'
    AND event_date >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
)
SELECT 
  landing_page,
  COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))) AS total_sessions,
  ROUND(AVG(engagement_time) / 1000, 2) AS avg_engagement_seconds
FROM session_data
WHERE landing_page IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC
LIMIT 5;`,
      output: "Ranked Data Table",
      insight: "The '/pricing' page drives the 2nd most sessions, but has the lowest engagement time (12s), indicating a possible UX issue."
    },
    comparison: {
      competitor: 'Native GA4 Interface',
      competitorFlaws: [
        'Steep learning curve requiring hours of training just to build a basic funnel report.',
        'Heavy data sampling kicks in quickly, distorting your numbers.',
        'No conversational interface for ad-hoc exploration.'
      ],
      arcliWins: [
        'Zero learning curve: If you can type a question, you can analyze your traffic.',
        'Queries the raw BigQuery export, guaranteeing 100% unsampled, accurate data.',
        'Renders complex data into beautiful Vega charts instantly.'
      ]
    },
    useCases: [
      { title: 'Marketing Attribution', description: 'Determine exactly which organic content channels are driving high-intent users using our semantic routing logic.' },
      { title: 'UX Optimization', description: 'Instantly generate multi-step funnel reports to find exactly where mobile users are dropping out of your checkout flow.' }
    ],
    faqs: [
      { q: 'Can I combine GA4 data with my internal production database?', a: 'Yes! This is Arcli\'s superpower. If you pass a User ID to GA4, Arcli can write the complex SQL required to join your GA4 acquisition data with your internal Postgres or Snowflake database to calculate true Return on Ad Spend (ROAS).' },
      { q: 'Does Arcli connect via the GA4 API or BigQuery?', a: 'For the best performance and to avoid GA4 API sampling/quotas, we highly recommend and natively support connecting to your GA4 BigQuery export.' }
    ],
    relatedSlugs: ['marketing-dashboard-template', 'natural-language-to-sql']
  }
};