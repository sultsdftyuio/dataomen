// lib/seo/text-to-sql-stripe-1.tsx

import { TemplateBlueprint } from './index';

/**
 * LIGHT TEMPLATE: Stripe MRR SQL
 * High-intent query focused on real-time Monthly Recurring Revenue extraction.
 * Analytical Pattern: MRR (Normalization, Quantity Expansion & Aggregation)
 * V13 Upgraded: Includes structuredData, conversionRouting, and uiVisualizations.
 */
export const stripeMrrSql: TemplateBlueprint = {
  slug: 'stripe-mrr-sql',
  type: 'template',
  seo: {
    title: 'Stripe MRR (Monthly Recurring Revenue) SQL Query | Arcli',
    description: 'Calculate true Stripe MRR using this production-ready SQL template. Automatically normalizes annual/monthly billing intervals and unit quantities.',
    h1: 'Stripe MRR (Monthly Recurring Revenue) SQL Template',
    keywords: [
      'stripe mrr sql', 
      'how to calculate mrr in stripe query', 
      'stripe monthly recurring revenue sql',
      'stripe subscription sql',
      'stripe mrr normalization'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe MRR (Monthly Recurring Revenue) SQL Template',
    subtitle: 'A standardized SQL snippet to extract, normalize, and aggregate your active subscription revenue directly from Stripe into a clean MRR baseline.',
  },
  
  conversionRouting: {
    primaryCTA: { label: 'Connect Stripe & Calculate MRR', url: '/register?intent=stripe_mrr' },
    secondaryCTA: { label: 'View the Full MRR Dashboard', url: '/templates/stripe-mrr-dashboard' },
    parentLink: '/templates',
    internalLinks: ['/integrations/stripe', '/templates/stripe-churn-rate-sql']
  },

  uiVisualizations: [
    {
      type: 'KPICardSeries',
      dataMapping: { primary: 'total_mrr', secondary: 'active_customers', tertiary: 'arpu' },
      interactionPurpose: 'Provide an immediate, executive-level view of the core SaaS metrics outputted by the query.',
      intentServed: 'Executive summary.'
    },
    {
      type: 'TimeSeriesBarChart',
      dataMapping: { x: 'month', yBar: 'total_mrr' },
      interactionPurpose: 'Visualize MRR growth over time when the query is grouped by subscription start dates.',
      intentServed: 'Trend analysis.'
    }
  ],

  structuredData: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Stripe MRR SQL Engine",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web"
  },

  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake
WITH active_subs AS (
  SELECT 
    customer_id,
    id AS subscription_id,
    status,
    -- Stripe stores amounts in cents; convert to decimal
    (plan_amount / 100.0) AS base_unit_amount,
    -- Must account for per-seat pricing models
    COALESCE(quantity, 1) AS seat_count,
    plan_interval
  FROM stripe.subscriptions
  WHERE status IN ('active', 'past_due')
    -- Subscriptions set to cancel are still MRR until the exact period end date
    AND (cancel_at_period_end = false OR cancel_at > CURRENT_TIMESTAMP)
)
SELECT 
  ROUND(SUM(
    CASE 
      WHEN plan_interval = 'year' THEN (base_unit_amount * seat_count) / 12.0
      WHEN plan_interval = 'week' THEN (base_unit_amount * seat_count) * (52.0 / 12.0)
      ELSE (base_unit_amount * seat_count)
    END
  )::numeric, 2) AS total_mrr,
  COUNT(DISTINCT customer_id) AS active_customers,
  ROUND((SUM(
    CASE 
      WHEN plan_interval = 'year' THEN (base_unit_amount * seat_count) / 12.0
      ELSE (base_unit_amount * seat_count) 
    END
  ) / NULLIF(COUNT(DISTINCT customer_id), 0))::numeric, 2) AS arpu
FROM active_subs;
    `,
    explanation: 'This query isolates all revenue-generating subscriptions (including those in dunning). It converts cent-based integers into standard decimals, multiplies by the `quantity` field to account for per-seat pricing, and uses a deterministic CASE statement to mathematically normalize annual and weekly billing intervals into a precise monthly MRR equivalent.',
  },
  useCases: [
    {
      title: 'Investor Reporting (VP of Finance)',
      description: 'Generate an audit-proof MRR metric that standardizes multi-interval billing and seat-expansions, providing a single source of truth for financial modeling and board updates.'
    }
  ],
  faqs: [
    {
      q: 'Does this MRR query account for Stripe coupons or discounts?',
      a: 'No. To calculate Net MRR post-discount, you must join the `stripe.discounts` and `stripe.coupons` tables against the active subscriptions, applying the `percent_off` or `amount_off` logic prior to the final aggregation step.',
      persona: 'Lead Analytics Engineer'
    },
    {
      q: 'Why include "past_due" subscriptions in the MRR calculation?',
      a: 'A past-due invoice is legally considered active revenue undergoing dunning retries (Smart Retries). Excluding it prematurely artificially depresses your MRR before a hard churn event has actually been realized by the system.',
      persona: 'RevOps Manager'
    }
  ],
  relatedSlugs: [
    'stripe-mrr-dashboard',
    'stripe-churn-rate-sql'
  ] 
};

/**
 * LIGHT TEMPLATE: Stripe Churn Rate SQL
 * High-intent query focused on subscription loss velocity.
 * Analytical Pattern: Churn (Temporal State Tracking & Cohorts)
 */
export const stripeChurnRateSql: TemplateBlueprint = {
  slug: 'stripe-churn-rate-sql',
  type: 'template',
  seo: {
    title: 'Stripe Gross Churn Rate SQL Query Template | Arcli',
    description: 'Track SaaS gross churn rate with this standardized Stripe SQL query. Accurately calculate monthly subscription cancellations against active temporal baselines.',
    h1: 'Stripe Gross Churn Rate SQL Query',
    keywords: [
      'stripe churn rate sql', 
      'how to calculate churn stripe query', 
      'saas churn calculation sql',
      'stripe cancellation tracking database'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe Gross Churn Rate SQL Template',
    subtitle: 'Measure your subscription retention health by calculating the exact percentage of customers who canceled their service relative to the active base at the start of the month.',
  },

  conversionRouting: {
    primaryCTA: { label: 'Connect Stripe & Track Churn', url: '/register?intent=stripe_churn' },
    secondaryCTA: { label: 'Explore Churn Dashboards', url: '/templates/stripe-churn-dashboard' },
    parentLink: '/templates',
    internalLinks: ['/templates/stripe-mrr-sql', '/templates/stripe-ltv-sql']
  },

  uiVisualizations: [
    {
      type: 'ComboChart',
      dataMapping: { x: 'month_start', yLine: 'gross_churn_percentage', yBar: 'churned_this_month' },
      interactionPurpose: 'Plot the gross churn percentage as a line over a bar chart of absolute churned subscriptions.',
      intentServed: 'Identify seasonal or product-driven churn spikes.'
    }
  ],

  structuredData: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Stripe Churn Analytics",
    "applicationCategory": "BusinessApplication"
  },

  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake
WITH subscription_periods AS (
  SELECT 
    id AS subscription_id,
    customer_id,
    DATE_TRUNC('month', start_date) AS active_month,
    -- Determine the exact month the subscription was hard-canceled
    DATE_TRUNC('month', canceled_at) AS churn_month
  FROM stripe.subscriptions
  WHERE status IN ('active', 'canceled', 'past_due')
),
monthly_totals AS (
  SELECT 
    DATE_TRUNC('month', calendar.month_date) AS month_start,
    -- Count subs active at the very start of the month
    COUNT(DISTINCT CASE WHEN s.active_month <= calendar.month_date AND (s.churn_month > calendar.month_date OR s.churn_month IS NULL) THEN s.subscription_id END) AS starting_active_subs,
    -- Count subs that specifically churned during this month
    COUNT(DISTINCT CASE WHEN s.churn_month = calendar.month_date THEN s.subscription_id END) AS churned_this_month
  FROM (
    -- Generate a simple trailing 12-month spine
    SELECT GENERATE_SERIES(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months'), DATE_TRUNC('month', CURRENT_DATE), '1 month'::interval) AS month_date
  ) calendar
  CROSS JOIN subscription_periods s
  GROUP BY 1
)
SELECT 
  month_start,
  starting_active_subs,
  churned_this_month,
  ROUND((churned_this_month::numeric / NULLIF(starting_active_subs, 0)) * 100, 2) AS gross_churn_percentage
FROM monthly_totals
ORDER BY month_start DESC;
    `,
    explanation: 'This script utilizes a temporal state-tracking approach. It generates a 12-month calendar spine and cross-joins it against subscription lifecycles to calculate exactly how many subscriptions were active at the dawn of the month, versus how many experienced a hard `canceled_at` timestamp during that same month.',
  },
  useCases: [
    {
      title: 'SaaS Health Monitoring (Product Analytics)',
      description: 'Track gross churn percentage natively in your data warehouse. A sudden spike in the current month provides an early warning signal to pause acquisition spend and investigate product friction.'
    }
  ],
  faqs: [
    {
      q: 'Does this query distinguish between voluntary and involuntary churn?',
      a: 'No. The `canceled` status in Stripe catches both explicit user cancellations (voluntary) and terminal dunning failures (involuntary). You must join `stripe.invoices` and check the `billing_reason` to isolate dunning-induced churn.',
      persona: 'Lead Analytics Engineer'
    },
    {
      q: 'What is the difference between `canceled_at` and `cancel_at_period_end`?',
      a: '`canceled_at` is the exact timestamp the subscription was physically terminated. `cancel_at_period_end` is a boolean flag indicating the user clicked cancel in the UI, but they retain access until their billing cycle finishes. True churn metrics only count the hard `canceled_at` date.',
      persona: 'FinOps Analyst'
    }
  ],
  relatedSlugs: [
    'stripe-churn-dashboard',
    'stripe-ltv-sql'
  ]
};

/**
 * LIGHT TEMPLATE: Stripe LTV (Lifetime Value) SQL
 * High-intent query utilizing advanced statistical percentiles.
 * Analytical Pattern: Lifetime Value (Net Cash Realization & Percentile Distribution)
 */
export const stripeLtvSql: TemplateBlueprint = {
  slug: 'stripe-ltv-sql',
  type: 'template',
  seo: {
    title: 'Stripe Lifetime Value (LTV) SQL Query Template | Arcli',
    description: 'Calculate empirical Stripe Customer Lifetime Value using net successful charges. Avoid enterprise skew with native median LTV percentile distribution logic.',
    h1: 'Stripe Customer Lifetime Value (LTV) SQL Query',
    keywords: [
      'stripe ltv sql', 
      'calculate ltv from stripe charges', 
      'saas lifetime value sql',
      'median ltv sql query postgres'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe Customer Lifetime Value (LTV) SQL Template',
    subtitle: 'Bypass theoretical ARR/Churn formulas. Calculate your absolute, empirical historical LTV by aggregating successful, unrefunded Stripe charges.',
  },

  conversionRouting: {
    primaryCTA: { label: 'Connect Stripe & Analyze LTV', url: '/register?intent=stripe_ltv' },
    secondaryCTA: { label: 'See the LTV Dashboard Blueprint', url: '/templates/stripe-ltv-dashboard' },
    parentLink: '/templates',
    internalLinks: ['/templates/stripe-churn-rate-sql']
  },

  uiVisualizations: [
    {
      type: 'DistributionHistogram',
      dataMapping: { x: 'net_realized_cash', frequency: 'customer_count' },
      interactionPurpose: 'Visualize the skew between average LTV and median LTV to prove the existence of enterprise outliers.',
      intentServed: 'Statistical validation of customer value.'
    }
  ],

  structuredData: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Arcli Stripe LTV Analyzer",
    "applicationCategory": "BusinessApplication"
  },

  features: {
    sqlQuery: `
-- Dialect: Snowflake / Standard PostgreSQL
WITH successful_charges AS (
  SELECT 
    customer_id,
    MIN(created) AS first_charge_date,
    COUNT(id) AS total_payments,
    -- Extract true net cash by deducting refunds and disputed chargebacks
    SUM(amount - COALESCE(amount_refunded, 0)) / 100.0 AS net_realized_cash
  FROM stripe.charges
  WHERE paid = true 
    AND captured = true
    -- Exclude charges currently under active dispute
    AND disputed = false
  GROUP BY 1
)
SELECT 
  ROUND(AVG(net_realized_cash)::numeric, 2) AS average_ltv,
  ROUND(MAX(net_realized_cash)::numeric, 2) AS max_ltv,
  -- Use percentile window functions to find the true median, avoiding enterprise skew
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_realized_cash)::numeric, 2) AS median_ltv,
  COUNT(customer_id) AS total_paying_customers
FROM successful_charges
-- Ensure we only evaluate cohorts that have had time to mature (e.g., > 3 months old)
WHERE first_charge_date <= CURRENT_DATE - INTERVAL '90 days';
    `,
    explanation: 'Rather than using predictive formulas (ARPU / Churn), this query calculates empirical Cash LTV. It aggregates all successfully captured charges minus refunds and active disputes per customer. Because B2B SaaS data is often heavily right-skewed by a few massive enterprise accounts, it utilizes the `PERCENTILE_CONT(0.5)` function to provide the true Median LTV.',
  },
  useCases: [
    {
      title: 'Allowable CAC Definition (CFO)',
      description: 'Relying on "Average LTV" is dangerous if 10% of users provide 80% of revenue. Using the Median LTV metric generated here ensures your allowable Customer Acquisition Cost (CAC) marketing targets are grounded in typical user reality.'
    }
  ],
  faqs: [
    {
      q: 'Why use `stripe.charges` instead of `stripe.invoices` for LTV?',
      a: '`stripe.charges` acts as the lowest-level source of truth for physical money movement, capturing one-off payments, prorations, and setup fees that might be obfuscated or zeroed-out in higher-level subscription invoices.',
      persona: 'Lead Data Engineer'
    },
    {
      q: 'Does this SQL script handle multi-currency Stripe accounts?',
      a: 'No. The `SUM(amount)` logic inherently assumes a single base currency. If you accept payments in multiple currencies, you must join `stripe.charges` against a daily FX exchange rate table and normalize all amounts to your base currency (e.g., USD) before aggregating.',
      persona: 'Analytics Engineer'
    }
  ],
  relatedSlugs: [
    'stripe-ltv-dashboard',
    'stripe-mrr-sql'
  ]
};