// lib/seo/text-to-sql-stripe-1.tsx

import { TemplateBlueprint } from './index';

/**
 * LIGHT TEMPLATE: Stripe MRR SQL
 * High-intent query focused on real-time Monthly Recurring Revenue extraction.
 * Analytical Pattern: MRR (Normalization & Aggregation)
 */
export const stripeMrrSql: TemplateBlueprint = {
  slug: 'stripe-mrr-sql',
  type: 'template',
  seo: {
    title: 'Stripe MRR (Monthly Recurring Revenue) SQL Query | Arcli',
    description: 'Calculate your true Stripe MRR using this production-ready SQL template. Automatically normalizes annual and monthly subscription tiers.',
    h1: 'Stripe MRR (Monthly Recurring Revenue) SQL Template',
    keywords: [
      'stripe mrr sql', 
      'how to calculate mrr in stripe query', 
      'stripe monthly recurring revenue sql',
      'stripe subscription sql'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe MRR (Monthly Recurring Revenue) SQL Template',
    subtitle: 'A standardized SQL snippet to extract and normalize your active subscription revenue directly from Stripe into a clean MRR baseline.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / Snowflake
WITH active_subs AS (
  SELECT 
    customer_id,
    id AS subscription_id,
    status,
    -- Stripe stores amounts in cents; convert to standard currency
    (plan_amount / 100.0) AS base_amount,
    plan_interval
  FROM stripe.subscriptions
  WHERE status IN ('active', 'past_due')
    -- Exclude subscriptions explicitly set to cancel
    AND cancel_at_period_end = false
)
SELECT 
  ROUND(SUM(
    CASE 
      WHEN plan_interval = 'year' THEN base_amount / 12
      WHEN plan_interval = 'week' THEN base_amount * 4.33
      ELSE base_amount 
    END
  )::numeric, 2) AS total_mrr,
  COUNT(DISTINCT customer_id) AS active_customers,
  ROUND((SUM(
    CASE 
      WHEN plan_interval = 'year' THEN base_amount / 12
      ELSE base_amount 
    END
  ) / NULLIF(COUNT(DISTINCT customer_id), 0))::numeric, 2) AS arpu
FROM active_subs;
    `,
    explanation: 'This query isolates all active and past-due subscriptions, converts their cent-based integer values into standard decimals, and uses a CASE statement to mathematically normalize annual and weekly billing intervals into a monthly MRR equivalent.',
  },
  useCases: [
    {
      title: 'Investor Reporting (CFO)',
      description: 'Generate an audit-proof MRR metric that standardizes multi-interval billing, providing a single source of truth for financial modeling and board updates.'
    }
  ],
  // STRICT RULE: 2-3 FAQs, ultra concise, edge case focused
  faqs: [
    {
      q: 'Does this MRR query account for Stripe coupons or discounts?',
      a: 'No. To calculate net MRR post-discount, you must join the `stripe.discounts` table against the active subscriptions and subtract the percentage or fixed amount prior to the final aggregation.',
      persona: 'Engineer'
    },
    {
      q: 'Why include "past_due" subscriptions in the MRR calculation?',
      a: 'A past-due invoice is still legally considered active revenue undergoing dunning retries. Excluding it prematurely artificially depresses your MRR before a hard churn event has actually occurred.',
      persona: 'RevOps'
    }
  ],
  // STRICT RULE: Link to 1 relevant HEAVY page (Dashboard) + 1 lateral LIGHT page
  relatedSlugs: [
    'stripe-mrr-dashboard',
    'stripe-churn-rate-sql'
  ] 
};

/**
 * LIGHT TEMPLATE: Stripe Churn Rate SQL
 * High-intent query focused on subscription loss velocity.
 * Analytical Pattern: Churn (Time-series & State Tracking)
 */
export const stripeChurnRateSql: TemplateBlueprint = {
  slug: 'stripe-churn-rate-sql',
  type: 'template',
  seo: {
    title: 'Stripe Churn Rate SQL Query Template | Arcli',
    description: 'Track your SaaS gross churn rate with this standardized Stripe SQL query. Monitor monthly subscription cancellations against active baselines.',
    h1: 'Stripe Gross Churn Rate SQL Query',
    keywords: [
      'stripe churn rate sql', 
      'how to calculate churn stripe query', 
      'saas churn calculation sql',
      'stripe cancellation tracking'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe Gross Churn Rate SQL Template',
    subtitle: 'Measure your subscription retention health by calculating the exact percentage of customers who canceled their service month-over-month.',
  },
  features: {
    sqlQuery: `
-- Dialect: Standard PostgreSQL / BigQuery
WITH monthly_activity AS (
  SELECT 
    DATE_TRUNC('month', created) AS month_start,
    COUNT(id) AS new_subscriptions,
    -- Count distinct subscriptions where the cancellation occurred in this exact month
    SUM(CASE WHEN status = 'canceled' AND DATE_TRUNC('month', canceled_at) = DATE_TRUNC('month', created) THEN 1 ELSE 0 END) AS immediate_churn,
    SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS total_historical_churn
  FROM stripe.subscriptions
  GROUP BY 1
),
churn_metrics AS (
  SELECT
    month_start,
    new_subscriptions,
    -- Use a window function to calculate the running total of active subs prior to the current month
    SUM(new_subscriptions) OVER (ORDER BY month_start ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS starting_active_subs,
    total_historical_churn
  FROM monthly_activity
)
SELECT 
  month_start,
  starting_active_subs,
  total_historical_churn AS canceled_this_month,
  ROUND((total_historical_churn::numeric / NULLIF(starting_active_subs, 0)) * 100, 2) AS gross_churn_percentage
FROM churn_metrics
ORDER BY month_start DESC;
    `,
    explanation: 'This script groups subscription creation and cancellation timestamps by month. It utilizes window functions to determine the starting active subscription base for any given month, then divides the cancellations by that base to yield the gross churn percentage.',
  },
  useCases: [
    {
      title: 'SaaS Health Monitoring (RevOps)',
      description: 'Track gross churn percentage natively in your warehouse. A sudden spike in the current month provides an early warning signal to pause acquisition spend and investigate product issues.'
    }
  ],
  // STRICT RULE: 2-3 FAQs, ultra concise, edge case focused
  faqs: [
    {
      q: 'Does this query distinguish between voluntary and involuntary churn?',
      a: 'No. The `canceled` status in Stripe catches both explicit user cancellations (voluntary) and dunning failures (involuntary). You must join `stripe.invoices` to isolate dunning-induced churn.',
      persona: 'Engineer'
    },
    {
      q: 'What is the difference between `canceled_at` and `cancel_at_period_end`?',
      a: '`canceled_at` is the exact timestamp the subscription was terminated. `cancel_at_period_end` is a boolean flag indicating the user clicked cancel, but they retain access until their billing cycle finishes. This query only counts hard cancellations.',
      persona: 'RevOps'
    }
  ],
  // STRICT RULE: Link to 1 relevant HEAVY page (Dashboard) + 1 lateral LIGHT page
  relatedSlugs: [
    'stripe-churn-dashboard',
    'stripe-ltv-sql'
  ]
};

/**
 * LIGHT TEMPLATE: Stripe LTV (Lifetime Value) SQL
 * High-intent query utilizing advanced statistical percentiles.
 * Analytical Pattern: Lifetime Value (Net Revenue & Percentile Distribution)
 */
export const stripeLtvSql: TemplateBlueprint = {
  slug: 'stripe-ltv-sql',
  type: 'template',
  seo: {
    title: 'Stripe Lifetime Value (LTV) SQL Query Template | Arcli',
    description: 'Calculate true Stripe Customer Lifetime Value using net successful charges. Includes median and average LTV percentile distribution logic.',
    h1: 'Stripe Customer Lifetime Value (LTV) SQL Query',
    keywords: [
      'stripe ltv sql', 
      'calculate ltv from stripe charges', 
      'saas lifetime value sql',
      'median ltv sql query'
    ],
    intent: 'template',
  },
  hero: {
    h1: 'Stripe Customer Lifetime Value (LTV) SQL Template',
    subtitle: 'Bypass theoretical ARR/Churn formulas. Calculate your absolute, realized historical LTV by aggregating successful, unrefunded Stripe charges.',
  },
  features: {
    sqlQuery: `
-- Dialect: Snowflake / Standard PostgreSQL
WITH successful_charges AS (
  SELECT 
    customer_id,
    MIN(created) AS first_charge_date,
    COUNT(id) AS total_payments,
    -- Extract net revenue by deducting refunds from the raw capture amount
    SUM(amount - COALESCE(amount_refunded, 0)) / 100.0 AS net_revenue
  FROM stripe.charges
  WHERE paid = true 
    AND captured = true
  GROUP BY 1
)
SELECT 
  ROUND(AVG(net_revenue)::numeric, 2) AS average_ltv,
  ROUND(MAX(net_revenue)::numeric, 2) AS max_ltv,
  -- Use percentile functions to find the median, avoiding massive enterprise skew
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_revenue) AS median_ltv,
  COUNT(customer_id) AS total_paying_customers
FROM successful_charges;
    `,
    explanation: 'Rather than using predictive formulas (ARPU / Churn), this query calculates empirical LTV. It aggregates all successfully captured charges minus refunds per customer. Because B2B SaaS data is often heavily skewed by a few massive enterprise accounts, it utilizes the `PERCENTILE_CONT(0.5)` function to provide the true Median LTV.',
  },
  useCases: [
    {
      title: 'Allowable CAC Definition (CFO)',
      description: 'Relying on "Average LTV" can be dangerous if 10% of users provide 80% of revenue. Using the Median LTV metric generated here ensures your allowable Customer Acquisition Cost (CAC) targets are grounded in reality.'
    }
  ],
  // STRICT RULE: 2-3 FAQs, ultra concise, edge case focused
  faqs: [
    {
      q: 'Why use `stripe.charges` instead of `stripe.invoices`?',
      a: '`stripe.charges` acts as the lowest-level source of truth for physical money movement, capturing one-off payments, prorations, and setup fees that might be obfuscated in higher-level subscription invoices.',
      persona: 'Engineer'
    },
    {
      q: 'Does this handle multi-currency Stripe accounts?',
      a: 'No. The `SUM(amount)` logic assumes a single base currency. If you accept payments in multiple currencies, you must join exchange rate data and normalize everything to your base currency (e.g., USD) before aggregating.',
      persona: 'Engineer'
    }
  ],
  // STRICT RULE: Link to 1 relevant HEAVY page (Dashboard) + 1 lateral LIGHT page
  relatedSlugs: [
    'stripe-ltv-dashboard',
    'stripe-mrr-sql'
  ]
};